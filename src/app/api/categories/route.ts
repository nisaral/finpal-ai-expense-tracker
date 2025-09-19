import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { categories } from '@/db/schema';
import { eq, like, and, or, desc, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search');

    let query = db.select().from(categories);

    if (search) {
      query = query.where(
        or(
          like(categories.name, `%${search}%`),
          like(categories.emoji, `%${search}%`)
        )
      );
    }

    const results = await query.limit(limit).offset(offset).orderBy(asc(categories.name));

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET categories error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      code: 'DATABASE_ERROR'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, emoji, color } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Name is required',
        code: 'MISSING_NAME'
      }, { status: 400 });
    }

    // Sanitize inputs
    const sanitizedName = name.trim();
    const sanitizedEmoji = emoji?.trim() || null;
    const sanitizedColor = color?.trim() || null;

    // Check for duplicate name
    const existingCategory = await db.select()
      .from(categories)
      .where(eq(categories.name, sanitizedName))
      .limit(1);

    if (existingCategory.length > 0) {
      return NextResponse.json({ 
        error: 'Category name already exists',
        code: 'DUPLICATE_NAME'
      }, { status: 400 });
    }

    // Create new category with isDefault forced to false
    const newCategory = await db.insert(categories)
      .values({
        name: sanitizedName,
        emoji: sanitizedEmoji,
        color: sanitizedColor,
        isDefault: false
      })
      .returning();

    return NextResponse.json(newCategory[0], { status: 201 });
  } catch (error) {
    console.error('POST category error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      code: 'DATABASE_ERROR'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return NextResponse.json({ 
    error: 'Method not allowed',
    code: 'METHOD_NOT_ALLOWED'
  }, { status: 405 });
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json({ 
    error: 'Method not allowed',
    code: 'METHOD_NOT_ALLOWED'
  }, { status: 405 });
}