import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, vendorRules, splits } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Mistral fallback (server-side) for robust parsing when regex/keywords fail
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
async function llmExtract(message: string, categoryNames: string[]): Promise<{ amount?: number; vendor?: string; category?: string } | null> {
  try {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) return null;

    const system = `You are an expense parser. Extract structured data from a short message. The message can be in English or Hindi or mixed.
Return a compact JSON with keys: amount (number, rupees), vendor (string lowercase words only), category (one of: ${categoryNames.join(", ")}).
If category uncertain, choose the closest from the list. Handle Hindi words by mapping to appropriate categories (e.g., khana -> Eating Out, sabji -> Groceries). Do not include any explanation.`;

    const res = await fetch(MISTRAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: message }
        ],
        response_format: { type: 'text' },
      }),
    });
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    // try to parse JSON from content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    return parsed;
  } catch {
    return null;
  }
}

// --- New: simple natural-language date parsing ---
function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};
function parseDateFromText(text: string): string | null {
  const t = text.toLowerCase().trim();
  const today = new Date();
  // today / yesterday
  if (/\b(today)\b/.test(t)) {
    return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  }
  if (/\b(yday|yesterday)\b/.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  // dd[st|nd|rd|th]? (\s|-) mon[th] [yyyy]
  const m1 = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b(?:[\s,-]*(\d{2,4}))?/i);
  if (m1) {
    const day = parseInt(m1[1], 10);
    const monName = m1[2].toLowerCase();
    const mon = MONTHS[monName];
    if (mon != null) {
      let year = m1[3] ? parseInt(m1[3], 10) : today.getFullYear();
      if (year < 100) year += 2000;
      const d = new Date(year, mon, day);
      if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  // dd/mm[/yyyy] or dd-mm[-yyyy]
  const m2 = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m2) {
    const d = parseInt(m2[1], 10);
    const m = parseInt(m2[2], 10) - 1;
    let y = m2[3] ? parseInt(m2[3], 10) : today.getFullYear();
    if (y < 100) y += 2000;
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime())) return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  }
  // "on 12th" of current month/year
  const m3 = t.match(/\bon\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (m3) {
    const d = new Date(today);
    d.setDate(parseInt(m3[1], 10));
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Eating Out": ["dinner","lunch","breakfast","cafe","restaurant","zomato","swiggy","mcd","pizza","burger","food", "khana", "khaana", "dabba", "bhojan", "restaurant", "hotel"],
  "Groceries": ["grocery","groceries","milk","vegetables","dmart","bigbasket","big basket","fruits","bread", "sabji", "sabhji", "kirana", "dukan", "doodh", "phala"],
  "Transport": ["uber","ola","metro","bus","rickshaw","fuel","petrol","diesel","cab","taxi","train", "rhoda", "auto", "petrol", "diesel"],
  "Entertainment": ["movie","movies","netflix","spotify","bookmyshow","bms","gaming","game","cinema", "filam", "picchar", "tamasha"],
  "Bills & Utilities": ["rent","electricity","bill","wifi","internet","dth","gas","water","phone", "bhada", "bijli", "paani", "gas", "phone bill"],
  "Shopping": ["shopping","amazon","flipkart","myntra","clothes","shirt","shoes", "khareedari", "kapde", "joota"],
  "Health": ["doctor","medicine","pharmacy","hospital","clinic","medical", "doktar", "dawai", "auspatal"],
  "Travel": ["flight","train","hotel","airbnb","booking","trip","vacation", "hawaai jahaj", "train", "yatra"],
  "Education": ["course","udemy","coursera","books","tuition","class","school", "padhai", "kitab", "school"]
};

const STOPWORDS = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'was', 'are', 'were'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, autoCommit, date, splits: splitsData } = body;
    // NEW: allow client override for category via category_id or categoryId
    const forcedCategoryId: number | undefined = body?.category_id ?? body?.categoryId;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ 
        error: "Message is required and must be a string",
        code: "MISSING_MESSAGE" 
      }, { status: 400 });
    }

    // Extract amount (fallback to LLM if needed)
    const amountMatch = message.match(/\d+(?:\.\d{1,2})?/g);
    let amount = 0;
    let amountCents = 0;
    if (amountMatch && amountMatch.length > 0) {
      // Prefer the largest plausible money value, ignoring likely years
      const candidates = amountMatch
        .map(Number)
        .filter((n) => isFinite(n) && !(n >= 1900 && n <= 2099));
      const chosen = candidates.length > 0 ? Math.max(...candidates) : Number(amountMatch[amountMatch.length - 1]);
      amount = chosen;
      amountCents = Math.round(amount * 100);
    }

    // Extract vendor/keyword (simple heuristic)
    const cleanMessage = message
      .replace(/\d+(?:\.\d{1,2})?/g, '') // Remove numbers
      .replace(/[₹$€£¥]/g, '') // Remove currency symbols
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .toLowerCase()
      .trim();

    const tokens = cleanMessage
      .split(/\s+/)
      .filter(token => token.length > 0 && !STOPWORDS.includes(token))
      .slice(0, 3); // Take first 3 meaningful tokens

    let vendor = tokens.join(' ') || 'unknown';

    // Parse date
    let transactionDate = date;
    if (!transactionDate) {
      const parsedNLDate = parseDateFromText(message);
      if (parsedNLDate) {
        transactionDate = parsedNLDate;
      } else {
        const today = new Date();
        transactionDate = today.toISOString().split('T')[0];
      }
    } else {
      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(transactionDate)) {
        return NextResponse.json({ 
          error: "Invalid date format. Use YYYY-MM-DD",
          code: "INVALID_DATE_FORMAT" 
        }, { status: 400 });
      }
    }

    // Check vendor rules first OR honor forced category if provided
    const allVendorRules = await db.select().from(vendorRules);
    let suggestedCategory: any = null;

    // If client sent category override, use it and skip discovery
    if (forcedCategoryId) {
      const cat = await db.select().from(categories).where(eq(categories.id, forcedCategoryId)).limit(1);
      if (cat.length === 0) {
        return NextResponse.json({ error: 'Invalid category_id', code: 'INVALID_CATEGORY' }, { status: 400 });
      }
      suggestedCategory = cat[0];
    }

    // Only try to discover if not forced
    if (!suggestedCategory) {
      for (const rule of allVendorRules) {
        if (vendor.includes(rule.keyword) || rule.keyword.includes(vendor)) {
          suggestedCategory = await db.select()
            .from(categories)
            .where(eq(categories.id, rule.categoryId))
            .limit(1);
          
          if (suggestedCategory.length > 0) {
            suggestedCategory = suggestedCategory[0];
            break;
          }
        }
      }
    }

    // Check static dictionary if no vendor rule found and not forced
    if (!suggestedCategory) {
      for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        const found = keywords.some(keyword => 
          vendor.includes(keyword) || keyword.includes(vendor)
        );
        
        if (found) {
          const category = await db.select()
            .from(categories)
            .where(eq(categories.name, categoryName))
            .limit(1);
          
          if (category.length > 0) {
            suggestedCategory = category[0];
            break;
          }
        }
      }
    }

    // If amount missing OR category still unknown, try LLM fallback
    if ((!amountCents || amountCents <= 0) || !suggestedCategory) {
      const allCategories = await db.select().from(categories).orderBy(categories.name);
      const names = allCategories.map(c => c.name);
      const llm = await llmExtract(message, names);
      if (llm) {
        if ((!amountCents || amountCents <= 0) && typeof llm.amount === 'number' && isFinite(llm.amount)) {
          amount = llm.amount;
          amountCents = Math.round(amount * 100);
        }
        if (vendor === 'unknown' && typeof llm.vendor === 'string' && llm.vendor.trim()) {
          vendor = llm.vendor.toLowerCase();
        }
        if (!suggestedCategory && typeof llm.category === 'string' && llm.category.trim()) {
          const match = allCategories.find(c => c.name.toLowerCase() === llm.category.toLowerCase());
          if (match) suggestedCategory = match;
        }
        // If still no category but we fetched allCategories above and caller needs options
        if (!suggestedCategory && allCategories.length > 0) {
          return NextResponse.json({
            requiresCategory: true,
            parsed: {
              description: message,
              vendor,
              amountCents,
              date: transactionDate,
            },
            categories: allCategories,
          });
        }
      }
    }

    // If still no category (and LLM didn't help), return all categories for selection
    if (!suggestedCategory) {
      const allCategories = await db.select()
        .from(categories)
        .orderBy(categories.name);

      return NextResponse.json({
        requiresCategory: true,
        parsed: {
          description: message,
          vendor: vendor,
          amountCents: amountCents,
          date: transactionDate
        },
        categories: allCategories
      });
    }

    // Category determined
    if (autoCommit) {
      // Create transaction
      const createdAt = new Date().toISOString();
      const newTransaction = await db.insert(transactions)
        .values({
          description: message,
          vendor: vendor,
          amountCents: amountCents,
          categoryId: suggestedCategory.id,
          date: transactionDate,
          createdAt: createdAt
        })
        .returning();

      // Handle splits if provided
      let createdSplits: any[] = [];
      if (splitsData && splitsData.participants) {
        const transactionId = newTransaction[0].id;
        let participants: string[] = [];

        if (Array.isArray(splitsData.participants)) {
          participants = splitsData.participants;
        } else if (typeof splitsData.participants === 'number') {
          participants = Array.from({ length: splitsData.participants }, (_, i) => `Person ${i + 1}`);
        }

        if (participants.length > 0) {
          const shareCents = Math.floor(amountCents / participants.length);
          
          for (const participant of participants) {
            const split = await db.insert(splits).values({
              transactionId: transactionId,
              participant: participant,
              shareCents: shareCents
            }).returning();
            createdSplits.push(split[0]);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Added ₹${amount} to ${suggestedCategory.name}`,
        transaction: {
          ...newTransaction[0],
          category: suggestedCategory,
          splits: createdSplits
        }
      });
    } else {
      // Return parsed data with suggested category
      return NextResponse.json({
        parsed: {
          description: message,
          vendor: vendor,
          amountCents: amountCents,
          date: transactionDate,
          suggestedCategory_id: suggestedCategory.id,
          suggestedCategory: suggestedCategory
        }
      });
    }

  } catch (error) {
    console.error('NLP Parse error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      code: "INTERNAL_ERROR" 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // This endpoint doesn't return transactions, it only parses messages
    // Return empty array or error
    return NextResponse.json({ 
      error: 'Use POST method to parse messages',
      code: 'METHOD_NOT_ALLOWED' 
    }, { status: 405 });
  } catch (error) {
    console.error('NLP Parse GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      code: "INTERNAL_ERROR" 
    }, { status: 500 });
  }
}