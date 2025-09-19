import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, vendorRules, splits } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Eating Out": ["dinner","lunch","breakfast","cafe","restaurant","zomato","swiggy","mcd","pizza","burger","food"],
  "Groceries": ["grocery","groceries","milk","vegetables","dmart","bigbasket","big basket","fruits","bread"],
  "Transport": ["uber","ola","metro","bus","rickshaw","fuel","petrol","diesel","cab","taxi","train"],
  "Entertainment": ["movie","movies","netflix","spotify","bookmyshow","bms","gaming","game","cinema"],
  "Bills & Utilities": ["rent","electricity","bill","wifi","internet","dth","gas","water","phone"],
  "Shopping": ["shopping","amazon","flipkart","myntra","clothes","shirt","shoes"],
  "Health": ["doctor","medicine","pharmacy","hospital","clinic","medical"],
  "Travel": ["flight","train","hotel","airbnb","booking","trip","vacation"],
  "Education": ["course","udemy","coursera","books","tuition","class","school"]
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

    // Extract amount
    const amountMatch = message.match(/\d+(?:\.\d{1,2})?/g);
    if (!amountMatch || amountMatch.length === 0) {
      return NextResponse.json({ 
        error: "No amount found in message",
        code: "NO_AMOUNT_FOUND" 
      }, { status: 400 });
    }

    const amount = parseFloat(amountMatch[amountMatch.length - 1]);
    const amountCents = Math.round(amount * 100);

    // Extract vendor/keyword
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

    const vendor = tokens.join(' ') || 'unknown';

    // Parse date
    let transactionDate = date;
    if (!transactionDate) {
      const today = new Date();
      transactionDate = today.toISOString().split('T')[0];
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

    // If still no category, return all categories for selection
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