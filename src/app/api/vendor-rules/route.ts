import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { vendorRules, categories } from '@/db/schema';
import { eq, and, desc, asc, like } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const rules = await db
      .select({
        id: vendorRules.id,
        keyword: vendorRules.keyword,
        categoryId: vendorRules.categoryId,
        userId: vendorRules.userId,
        createdAt: vendorRules.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault,
        }
      })
      .from(vendorRules)
      .leftJoin(categories, eq(vendorRules.categoryId, categories.id))
      .orderBy(asc(vendorRules.keyword))
      .limit(limit)
      .offset(offset);

    return NextResponse.json(rules);
  } catch (error) {
    console.error('GET vendor-rules error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, category_id } = body;

    // Validate required fields
    if (!keyword || typeof keyword !== 'string') {
      return NextResponse.json({ 
        error: 'Keyword is required and must be a string',
        code: 'MISSING_KEYWORD'
      }, { status: 400 });
    }

    if (!category_id || isNaN(parseInt(category_id))) {
      return NextResponse.json({ 
        error: 'Category ID is required and must be a number',
        code: 'MISSING_CATEGORY_ID'
      }, { status: 400 });
    }

    // Check if category exists
    const category = await db
      .select()
      .from(categories)
      .where(eq(categories.id, parseInt(category_id)))
      .limit(1);

    if (category.length === 0) {
      return NextResponse.json({ 
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      }, { status: 400 });
    }

    // Normalize keyword
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Check for duplicate (user_id, keyword) pair
    const existingRule = await db
      .select()
      .from(vendorRules)
      .where(and(
        eq(vendorRules.keyword, normalizedKeyword),
        eq(vendorRules.userId, null) // user_id is nullable for now
      ))
      .limit(1);

    if (existingRule.length > 0) {
      return NextResponse.json({ 
        error: 'A rule with this keyword already exists',
        code: 'DUPLICATE_KEYWORD'
      }, { status: 400 });
    }

    // Create the rule
    const newRule = await db
      .insert(vendorRules)
      .values({
        keyword: normalizedKeyword,
        categoryId: parseInt(category_id),
        userId: null, // nullable for now
        createdAt: new Date().toISOString()
      })
      .returning();

    // Get the created rule with category details
    const ruleWithCategory = await db
      .select({
        id: vendorRules.id,
        keyword: vendorRules.keyword,
        categoryId: vendorRules.categoryId,
        userId: vendorRules.userId,
        createdAt: vendorRules.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault,
        }
      })
      .from(vendorRules)
      .leftJoin(categories, eq(vendorRules.categoryId, categories.id))
      .where(eq(vendorRules.id, newRule[0].id))
      .limit(1);

    return NextResponse.json(ruleWithCategory[0], { status: 201 });
  } catch (error) {
    console.error('POST vendor-rules error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}