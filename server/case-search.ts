/**
 * Maryland Case Search lookup via Scrapfly (bypasses DataDome CAPTCHA).
 * 
 * Supports ANY case number format — traffic citations, criminal cases, civil, etc.
 * Uses the Case Search inquiry page to search, then parses the results.
 * 
 * Requires SCRAPFLY_API_KEY environment variable.
 */

export interface CaseSearchResult {
  success: boolean;
  error?: string;
  defendant?: {
    name: string;
    dob?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  caseInfo?: {
    caseNumber: string;
    caseType: string;
    courtType: string;
    county: string;
    filingDate?: string;
    status?: string;
  };
  charges: Array<{
    chargeNumber: number;
    description: string;
    statute: string;
    disposition: string;
    dispositionDate: string;
    sentence?: string;
  }>;
  lawEnforcement?: string;
  arrestDate?: string;
  probationEndDate?: string;
  courtLocation?: string;  // raw Location value from Case Search (e.g., "Greenbelt");
  courtSystem?: string;    // Court System value (e.g., "District Court - Criminal")
  rawHtml?: string; // for debugging
}

function clean(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function toISODate(dateStr: string): string {
  // Convert MM/DD/YYYY to YYYY-MM-DD for HTML date inputs
  if (!dateStr) return "";
  const m = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  }
  // Already YYYY-MM-DD?
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
  return dateStr;
}

function extractAfterLabel(html: string, label: string): string {
  // The new MD Case Search portal (March 2026) is a React SPA.
  // Data is rendered in various patterns. Try many approaches.
  const patterns = [
    // New portal: label in one element, value in next sibling div/span
    new RegExp(label + '[:\\s]*</(?:span|div|label|dt|th|td|p)>\\s*<(?:span|div|dd|td|p)[^>]*>\\s*([^<]+)', 'i'),
    // New portal: label and value in same parent, separated by tags
    new RegExp(label + '[:\\s]*</[^>]+>\\s*<[^>]+>\\s*<[^>]+>\\s*([^<]+)', 'i'),
    // Classic table: Label</span></td><td><span>VALUE</span>
    new RegExp(label + '[:\\s]*</span>\\s*</td>\\s*<td[^>]*>\\s*<span[^>]*>([^<]+)', 'i'),
    // Classic: Label</td><td>VALUE</td>
    new RegExp(label + '[:\\s]*</td>\\s*<td[^>]*>\\s*([^<]+)', 'i'),
    // Bold label: Label:</b> VALUE
    new RegExp(label + '[:\\s]*</b>\\s*([^<]+)', 'i'),
    // Strong label
    new RegExp(label + '[:\\s]*</strong>\\s*([^<]+)', 'i'),
    // Aria-label or data attribute patterns
    new RegExp('aria-label="[^"]*' + label + '[^"]*"[^>]*>([^<]+)', 'i'),
    // Plain text after label with colon
    new RegExp(label + ':\\s*([^<,\\n]{2,50})', 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      const val = clean(m[1]);
      // Filter out JavaScript/CSS fragments
      if (val && val !== 'N/A' && val !== '' && 
          !val.includes('function') && !val.includes('==') && 
          !val.includes('{') && !val.includes('visibility') &&
          !val.includes('undefined') && !val.includes('document.') &&
          val.length < 200) {
        return val;
      }
    }
  }
  return "";
}

function parseDispositionType(rawDisp: string): string {
  const d = rawDisp.toLowerCase().trim();
  if (!d) return "";
  if (d.includes("not guilty") || d.includes("acquit")) return "acquittal";
  if (d.includes("nolle prosequi") || d.includes("nol pros") || d.includes("nolle pros")) return "nolle_prosequi";
  if (d.includes("stet")) return "stet";
  if (d.includes("dismissed") || d.includes("dismiss")) return "dismissal";
  if (d.includes("probation before judgment") || d.includes("p.b.j") || d.includes("pbj")) return "pbj";
  if (d.includes("not criminally responsible") || d.includes("ncr")) return "not_criminally_responsible";
  if (d.includes("guilty") || d.includes("convicted") || d.includes("plea: guilty") || d.includes("plea guilty")) return "guilty_misdemeanor";
  if (d.includes("compromise")) return "compromise";
  return "";
}

function parseCountyFromHtml(html: string, caseNumber: string): string {
  const counties = [
    "Allegany", "Anne Arundel", "Baltimore City", "Baltimore County",
    "Calvert", "Caroline", "Carroll", "Cecil", "Charles",
    "Dorchester", "Frederick", "Garrett", "Harford", "Howard",
    "Kent", "Montgomery", "Prince George's", "Queen Anne's",
    "St. Mary's", "Somerset", "Talbot", "Washington",
    "Wicomico", "Worcester",
  ];

  // Try extracting from page content
  const locText = extractAfterLabel(html, "Court System") || 
                  extractAfterLabel(html, "Location") ||
                  extractAfterLabel(html, "Court Name") || "";
  
  for (const c of counties) {
    if (locText.includes(c)) return c;
  }

  // Try district code from case number
  const districtMap: Record<string, string> = {
    "01": "Baltimore City", "02": "Baltimore County", "03": "Baltimore County",
    "04": "Calvert", "05": "Caroline", "06": "Carroll", "07": "Cecil",
    "08": "Charles", "09": "Dorchester", "10": "Frederick", "11": "Garrett",
    "12": "Harford", "13": "Howard", "14": "Kent", "15": "Montgomery",
    "16": "Prince George's", "17": "Queen Anne's", "18": "St. Mary's",
    "19": "Somerset", "20": "Talbot", "21": "Washington", "22": "Wicomico",
    "23": "Worcester", "24": "Allegany", "25": "Anne Arundel",
  };
  const codeMatch = caseNumber.match(/[A-Z]-?(\d{2})-?[A-Z]/i);
  if (codeMatch && districtMap[codeMatch[1]]) return districtMap[codeMatch[1]];

  // Search full HTML for any county name
  for (const c of counties) {
    if (html.includes(c)) return c;
  }
  return "";
}

function parseCourtType(caseNumber: string, html: string): string {
  if (caseNumber.toUpperCase().startsWith("D") || caseNumber.match(/^\d+[A-Z]/)) return "District";
  if (caseNumber.toUpperCase().startsWith("C")) return "Circuit";
  if (html.toLowerCase().includes("circuit court")) return "Circuit";
  return "District";
}

function parseCharges(html: string): CaseSearchResult["charges"] {
  const charges: CaseSearchResult["charges"] = [];
  
  // Look for charge sections — MD Case Search uses "Charge No" or "Charge Number"
  const sections: string[] = [];
  
  // Split by charge number markers
  const chargeRegex = /Charge\s*(?:No|Number)\s*[:.]\s*(\d+)/gi;
  let match;
  const positions: Array<{ index: number; num: number }> = [];
  
  while ((match = chargeRegex.exec(html)) !== null) {
    positions.push({ index: match.index, num: parseInt(match[1]) });
  }
  
  if (positions.length > 0) {
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].index;
      const end = i + 1 < positions.length ? positions[i + 1].index : Math.min(start + 3000, html.length);
      const section = html.substring(start, end);
      
      const desc = extractAfterLabel(section, "Charge Description") || 
                   extractAfterLabel(section, "Description") ||
                   extractAfterLabel(section, "Charge");
      const statute = extractAfterLabel(section, "Statute Code") || 
                      extractAfterLabel(section, "Statute") ||
                      extractAfterLabel(section, "CJIS Code");
      const disp = extractAfterLabel(section, "Disposition") ||
                   extractAfterLabel(section, "Plea");
      const dispDateRaw = extractAfterLabel(section, "Disposition Date") ||
                          extractAfterLabel(section, "DispositionDate");
      const dispDate = toISODate(dispDateRaw);
      const sentence = extractAfterLabel(section, "Sentence") ||
                       extractAfterLabel(section, "Sentence Length") ||
                       extractAfterLabel(section, "Fine Amount");

      if (desc || statute || disp) {
        // Map raw disposition text to our disposition types
        let mappedDisp = disp;
        if (disp) {
          const dispLower = disp.toLowerCase();
          if (dispLower.includes('probation before judgment') || dispLower.includes('pbj')) mappedDisp = 'Probation Before Judgment';
          else if (dispLower.includes('nolle prosequi') || dispLower.includes('nol pros')) mappedDisp = 'Nolle Prosequi';
          else if (dispLower.includes('not guilty') || dispLower.includes('acquit')) mappedDisp = 'Not Guilty';
          else if (dispLower.includes('stet')) mappedDisp = 'Stet';
          else if (dispLower.includes('dismiss')) mappedDisp = 'Dismissed';
          else if (dispLower.includes('guilty') || dispLower.includes('convicted')) mappedDisp = 'Guilty';
        }
        charges.push({
          chargeNumber: positions[i].num,
          description: desc,
          statute: statute,
          disposition: mappedDisp,
          dispositionDate: dispDate,
          sentence: sentence || undefined,
        });
      }
    }
  }
  
  // Fallback: try to grab single charge info if no numbered charges found
  if (charges.length === 0) {
    const desc = extractAfterLabel(html, "Charge Description") || extractAfterLabel(html, "Charge");
    const statute = extractAfterLabel(html, "Statute Code") || extractAfterLabel(html, "Statute");
    const disp = extractAfterLabel(html, "Disposition");
    const dispDate = toISODate(extractAfterLabel(html, "Disposition Date"));
    
    if (desc || statute) {
      charges.push({
        chargeNumber: 1,
        description: desc,
        statute: statute,
        disposition: disp,
        dispositionDate: dispDate,
      });
    }
  }
  
  return charges;
}

async function scrapflyFetch(url: string, apiKey: string): Promise<string> {
  const scrapflyUrl = `https://api.scrapfly.io/scrape?` + new URLSearchParams({
    key: apiKey,
    url: url,
    asp: 'true',
    render_js: 'true',
    rendering_wait: '10000',
    country: 'us',
    retry: 'false',
    timeout: '90000',
    proxy_pool: 'public_residential_pool',
  }).toString();
  
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  
  try {
    const response = await fetch(scrapflyUrl, { signal: controller.signal });
    clearTimeout(timer);
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Scrapfly API error (${response.status}): ${errText.substring(0, 200)}`);
    }
    
    const data = await response.json() as any;
    return data.result?.content || "";
  } catch (e: any) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Request timed out. Try again.");
    throw e;
  }
}

export async function lookupCase(caseNumber: string): Promise<CaseSearchResult> {
  const apiKey = process.env.SCRAPFLY_API_KEY;
  
  if (!apiKey) {
    return { success: false, error: "SCRAPFLY_API_KEY not configured. Set it in your environment variables.", charges: [] };
  }

  // Clean up the case number — remove extra spaces, keep dashes
  const cleanNum = caseNumber.trim();
  
  // New portal URL format (launched March 14, 2026)
  // Direct case detail: case-detail-page?caseId=XXXXX
  const searchUrl = `https://casesearch.courts.state.md.us/casesearch/case-detail-page?caseId=${encodeURIComponent(cleanNum)}`;

  try {
    console.log(`[CaseSearch] Looking up: ${cleanNum}`);
    let html = await scrapflyFetch(searchUrl, apiKey);
    
    if (!html || html.length < 200) {
      return { success: false, error: "Empty response from Case Search. Try again.", charges: [] };
    }

    // Save raw HTML for debugging
    try {
      const fs = await import('fs');
      fs.writeFileSync('/tmp/last_case_search.html', html);
      console.log(`[CaseSearch] Saved ${html.length} bytes of HTML to /tmp/last_case_search.html`);
    } catch (e) {
      console.log('[CaseSearch] Could not save debug HTML');
    }

    // Check if still on CAPTCHA
    if (html.includes("captcha-delivery") || html.includes("Verification Required") || html.includes("geo.captcha-delivery.com")) {
      return { success: false, error: "CAPTCHA was not bypassed. Try again — Scrapfly sometimes needs a second attempt.", charges: [] };
    }
    
    // Check if the search returned results or a "no results" page
    if (html.includes("No cases found") || html.includes("Sorry, but your query returned no results") || html.includes("returned no results")) {
      return { success: false, error: `Case "${cleanNum}" not found on Maryland Case Search. Check the case number and try again.`, charges: [] };
    }

    // If the search returned a results list or search page, try to find a link to the detail page
    if (html.includes("case-detail-page") && !html.includes("Case Information") && !html.includes("Defendant Name")) {
      const detailMatch = html.match(/href="([^"]*case-detail-page\?caseId=[^"]+)"/i);
      if (detailMatch) {
        let detailUrl = detailMatch[1].replace(/&amp;/g, '&');
        if (!detailUrl.startsWith('http')) {
          detailUrl = `https://casesearch.courts.state.md.us${detailUrl.startsWith('/') ? '' : '/casesearch/'}${detailUrl}`;
        }
        console.log(`[CaseSearch] Following detail link: ${detailUrl}`);
        html = await scrapflyFetch(detailUrl, apiKey);
        // Save the detail page HTML too
        try {
          const fs = await import('fs');
          fs.writeFileSync('/tmp/last_case_search.html', html);
        } catch {}
      }
    }

    // Now parse the detail page
    const result: CaseSearchResult = {
      success: true,
      charges: [],
    };

    // Defendant info — try multiple extraction strategies
    // Strategy 1: Look for "State of Maryland vs NAME" pattern (common in page title/header)
    let defName = "";
    const vsMatch = html.match(/(?:State of Maryland|STATE OF MARYLAND)\s+vs?\.?\s+([A-Z][A-Z\s,.'\-]+?)(?:<|"|\n|\||&lt;)/i);
    if (vsMatch) {
      defName = vsMatch[1].trim().replace(/\s+/g, ' ');
      // Filter out garbage
      if (defName.includes('{') || defName.includes('function') || defName.length > 100) defName = "";
    }
    // Strategy 2: Standard label extraction
    if (!defName) defName = extractAfterLabel(html, "Defendant Name");
    if (!defName) defName = extractAfterLabel(html, "Party Name");
    if (!defName) defName = extractAfterLabel(html, "Defendant");
    const defDOBRaw = extractAfterLabel(html, "Date of Birth") || extractAfterLabel(html, "DOB");
    const defDOB = toISODate(defDOBRaw);
    const defAddr = extractAfterLabel(html, "Street Address") || extractAfterLabel(html, "Address Line 1");
    const defCity = extractAfterLabel(html, "City");
    // Don't use plain "State" as it matches "State of Maryland"
    const defState = extractAfterLabel(html, "State:") || "MD";
    const defZip = extractAfterLabel(html, "Zip Code");
    
    if (defName) {
      result.defendant = {
        name: defName,
        dob: defDOB || undefined,
        address: defAddr || undefined,
        city: defCity || undefined,
        state: defState || "MD",
        zip: defZip || undefined,
      };
    }

    // Case info — new portal uses pipe-separated label|value format in rendered text
    const caseType = extractAfterLabel(html, "Case Type") || extractAfterLabel(html, "CaseType") || "";
    
    // County: Extract from Court System field AND from raw HTML text
    // The new portal renders: "Court System:|District Court - Criminal|Location:|Upper Marlboro|"
    // or "Court System:|Circuit Court For Prince Georges County - Criminal|"
    let county = "";
    
    // Strategy 1: Look for "Court For XXX County" anywhere in the HTML (most reliable)
    const countyFromCourt = html.match(/Court\s+(?:For|for|of)\s+([A-Za-z' .]+?)\s+County/i);
    if (countyFromCourt) {
      let extracted = countyFromCourt[1].trim();
      // Normalize county names
      if (extracted.toLowerCase().includes("prince george")) extracted = "Prince George's";
      else if (extracted.toLowerCase().includes("st. mary") || extracted.toLowerCase().includes("st mary")) extracted = "St. Mary's";
      else if (extracted.toLowerCase().includes("queen anne")) extracted = "Queen Anne's";
      else if (extracted.toLowerCase().includes("anne arundel")) extracted = "Anne Arundel";
      county = extracted;
      console.log(`[CaseSearch] County from Court System: ${county}`);
    }
    
    // Strategy 2: Check for Baltimore City specifically
    if (!county && html.toLowerCase().includes("baltimore city")) {
      county = "Baltimore City";
      console.log(`[CaseSearch] County: Baltimore City (from HTML)`);
    }
    
    // Strategy 3: Try extractAfterLabel
    if (!county) {
      const courtSystemVal = extractAfterLabel(html, "Court System");
      if (courtSystemVal) {
        const m = courtSystemVal.match(/(?:for|of)\s+([A-Za-z' .]+?)\s+(?:County|City)/i);
        if (m) {
          let extracted = m[1].trim();
          if (extracted.toLowerCase().includes("prince george")) extracted = "Prince George's";
          if (extracted.toLowerCase().includes("st. mary") || extracted.toLowerCase().includes("st mary")) extracted = "St. Mary's";
          if (extracted.toLowerCase().includes("queen anne")) extracted = "Queen Anne's";
          county = extracted;
        }
      }
    }
    
    // Next try Location field mapping
    const locationVal = extractAfterLabel(html, "Location");
    if (!county && locationVal) {
      const locMap: Record<string, string> = {
        // Prince George's County
        "upper marlboro": "Prince George's", "hyattsville": "Prince George's",
        "greenbelt": "Prince George's", "college park": "Prince George's",
        "bowie": "Prince George's", "laurel": "Prince George's",
        "landover": "Prince George's", "capitol heights": "Prince George's",
        "district heights": "Prince George's", "suitland": "Prince George's",
        "temple hills": "Prince George's", "fort washington": "Prince George's",
        "clinton": "Prince George's", "oxon hill": "Prince George's",
        "glenarden": "Prince George's", "new carrollton": "Prince George's",
        "prince george": "Prince George's",
        // Baltimore
        "baltimore": "Baltimore City", "towson": "Baltimore County",
        "catonsville": "Baltimore County", "essex": "Baltimore County",
        "dundalk": "Baltimore County", "pikesville": "Baltimore County",
        // Anne Arundel
        "annapolis": "Anne Arundel", "glen burnie": "Anne Arundel",
        "severna park": "Anne Arundel", "odenton": "Anne Arundel",
        // Montgomery
        "rockville": "Montgomery", "silver spring": "Montgomery",
        "germantown": "Montgomery", "bethesda": "Montgomery",
        "gaithersburg": "Montgomery",
        // Howard
        "ellicott city": "Howard", "columbia": "Howard",
        // Harford
        "bel air": "Harford", "aberdeen": "Harford",
        // Other counties
        "frederick": "Frederick", "hagerstown": "Washington",
        "salisbury": "Wicomico", "cambridge": "Dorchester",
        "la plata": "Charles", "waldorf": "Charles",
        "leonardtown": "St. Mary's", "prince frederick": "Calvert",
        "chestertown": "Kent", "elkton": "Cecil",
        "westminster": "Carroll", "oakland": "Garrett",
        "cumberland": "Allegany", "easton": "Talbot",
        "centreville": "Queen Anne's", "princess anne": "Somerset",
        "snow hill": "Worcester", "denton": "Caroline",
        "ocean city": "Worcester",
      };
      const locLower = locationVal.toLowerCase();
      for (const [city, cnty] of Object.entries(locMap)) {
        if (locLower.includes(city)) { county = cnty; break; }
      }
    }
    // Fallback: try raw HTML scanning and case number district code
    if (!county) county = parseCountyFromHtml(html, cleanNum);
    
    result.caseInfo = {
      caseNumber: cleanNum,
      caseType: caseType,
      courtType: parseCourtType(cleanNum, html),
      county: county,
      filingDate: toISODate(extractAfterLabel(html, "Filing Date")),
      status: extractAfterLabel(html, "Case Status") || extractAfterLabel(html, "Case Disposition"),
    };

    // Law enforcement
    result.lawEnforcement = extractAfterLabel(html, "Agency Name") || 
                            extractAfterLabel(html, "Arresting Agency") || 
                            extractAfterLabel(html, "Law Enforcement Agency") ||
                            extractAfterLabel(html, "Officer");
    result.arrestDate = toISODate(extractAfterLabel(html, "Arrest Date") || extractAfterLabel(html, "Date of Arrest"));
    result.courtLocation = locationVal || extractAfterLabel(html, "Location") || "";
    result.courtSystem = extractAfterLabel(html, "Court System") || "";

    // Extract PBJ end date if present (format: "PBJ END DATE : MM/DD/YYYY")
    const pbjMatch = html.match(/PBJ\s+END\s+DATE\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (pbjMatch) {
      result.probationEndDate = toISODate(pbjMatch[1]);
      console.log(`[CaseSearch] PBJ End Date: ${result.probationEndDate}`);
    }

    // Parse charges
    result.charges = parseCharges(html);

    // If we got nothing useful, return a snippet of the HTML for debugging
    if (!result.defendant && result.charges.length === 0) {
      console.log(`[CaseSearch] Page parsed but no data extracted. HTML length: ${html.length}`);
      // Extract a useful portion of the body content for debugging
      const bodyMatch = html.match(/<body[^>]*>(.*)<\/body>/is);
      const bodyText = bodyMatch ? bodyMatch[1] : html;
      // Strip scripts and styles for readability
      const cleaned = bodyText.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      console.log(`[CaseSearch] Cleaned text (first 2000): ${cleaned.substring(0, 2000)}`);
      return { 
        success: false, 
        error: "Case page loaded but couldn't extract data. Debug text: " + cleaned.substring(0, 1500), 
        charges: [],
      };
    }

    // Log what we extracted for debugging
    console.log(`[CaseSearch] Defendant: ${result.defendant?.name || 'NOT FOUND'}`);
    console.log(`[CaseSearch] DOB: ${defDOB || 'NOT FOUND'}`);
    console.log(`[CaseSearch] County: ${result.caseInfo?.county || 'NOT FOUND'}`);
    console.log(`[CaseSearch] Charges: ${result.charges.length}`);
    console.log(`[CaseSearch] Law Enforcement: ${result.lawEnforcement || 'NOT FOUND'}`);
    // Also log a text dump of the page for debugging
    const allText = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/\s+/g, ' ').trim();
    console.log(`[CaseSearch] Page text (first 3000): ${allText.substring(0, 3000)}`);
    console.log(`[CaseSearch] Success: ${result.defendant?.name || 'Unknown'}, ${result.charges.length} charges`);
    return result;
    
  } catch (e: any) {
    console.error(`[CaseSearch] Error:`, e.message);
    return { success: false, error: `Lookup failed: ${e.message}`, charges: [] };
  }
}
