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
  rawHtml?: string; // for debugging
}

function clean(s: string): string {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractAfterLabel(html: string, label: string): string {
  // Try multiple patterns for extracting values after labels in MD Case Search HTML
  const patterns = [
    // Pattern: <span class="Label">Label</span></td><td><span class="Value">VALUE</span>
    new RegExp(label + '[:\\s]*</span>\\s*</td>\\s*<td[^>]*>\\s*<span[^>]*>([^<]+)', 'i'),
    // Pattern: <td class="Label">Label</td><td class="Value">VALUE</td>
    new RegExp(label + '[:\\s]*</td>\\s*<td[^>]*>\\s*([^<]+)', 'i'),
    // Pattern: Label:</b> VALUE
    new RegExp(label + '[:\\s]*</b>\\s*([^<]+)', 'i'),
    // Pattern: Label: VALUE (plain text after label)
    new RegExp(label + '[:\\s]+([^<\\n]+)', 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) {
      const val = clean(m[1]);
      if (val && val !== 'N/A' && val !== '') return val;
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
      const dispDate = extractAfterLabel(section, "Disposition Date") ||
                       extractAfterLabel(section, "DispositionDate");
      const sentence = extractAfterLabel(section, "Sentence") ||
                       extractAfterLabel(section, "Sentence Length") ||
                       extractAfterLabel(section, "Fine Amount");

      if (desc || statute || disp) {
        charges.push({
          chargeNumber: positions[i].num,
          description: desc,
          statute: statute,
          disposition: disp,
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
    const dispDate = extractAfterLabel(html, "Disposition Date");
    
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

    // Defendant info
    const defName = extractAfterLabel(html, "Defendant Name") || 
                    extractAfterLabel(html, "Name") ||
                    extractAfterLabel(html, "Party Name");
    const defDOB = extractAfterLabel(html, "Date of Birth") || extractAfterLabel(html, "DOB");
    const defAddr = extractAfterLabel(html, "Address") || extractAfterLabel(html, "Street Address");
    const defCity = extractAfterLabel(html, "City");
    const defState = extractAfterLabel(html, "State");
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

    // Case info
    const caseType = extractAfterLabel(html, "Case Type") || extractAfterLabel(html, "CaseType");
    result.caseInfo = {
      caseNumber: cleanNum,
      caseType: caseType || "",
      courtType: parseCourtType(cleanNum, html),
      county: parseCountyFromHtml(html, cleanNum),
      filingDate: extractAfterLabel(html, "Filing Date") || extractAfterLabel(html, "FilingDate"),
      status: extractAfterLabel(html, "Case Status") || extractAfterLabel(html, "Case Disposition") || extractAfterLabel(html, "Status"),
    };

    // Law enforcement
    result.lawEnforcement = extractAfterLabel(html, "Agency Name") || 
                            extractAfterLabel(html, "Arresting Agency") || 
                            extractAfterLabel(html, "Law Enforcement Agency") ||
                            extractAfterLabel(html, "Officer");
    result.arrestDate = extractAfterLabel(html, "Arrest Date") || extractAfterLabel(html, "Date of Arrest");

    // Parse charges
    result.charges = parseCharges(html);

    // If we got nothing useful, the page structure may have changed
    if (!result.defendant && result.charges.length === 0) {
      // Save raw HTML for debugging  
      console.log(`[CaseSearch] Page parsed but no data extracted. HTML length: ${html.length}`);
      console.log(`[CaseSearch] HTML snippet: ${html.substring(0, 500)}`);
      return { 
        success: false, 
        error: "Case page loaded but couldn't extract data. The page structure may have changed. Try using Manual Lookup instead.", 
        charges: [],
      };
    }

    console.log(`[CaseSearch] Success: ${result.defendant?.name || 'Unknown'}, ${result.charges.length} charges`);
    return result;
    
  } catch (e: any) {
    console.error(`[CaseSearch] Error:`, e.message);
    return { success: false, error: `Lookup failed: ${e.message}`, charges: [] };
  }
}
