import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { recurringExpenses, categories } from '@/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const results = await db
      .select({
        id: recurringExpenses.id,
        userId: recurringExpenses.userId,
        description: recurringExpenses.description,
        vendor: recurringExpenses.vendor,
        amountCents: recurringExpenses.amountCents,
        categoryId: recurringExpenses.categoryId,
        dayOfMonth: recurringExpenses.dayOfMonth,
        nextRunDate: recurringExpenses.nextRunDate,
        active: recurringExpenses.active,
        createdAt: recurringExpenses.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault
        }
      })
      .from(recurringExpenses)
      .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
      .orderBy(
        asc(recurringExpenses.nextRunDate),
        asc(recurringExpenses.dayOfMonth),
        asc(recurringExpenses.description)
      )
      .limit(limit)
      .offset(offset);

    return NextResponse.json(results);
  } catch (error) {
    console.error('GET recurring expenses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, vendor, amount_cents, category_id, day_of_month, active } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ 
        error: 'Description is required',
        code: 'MISSING_DESCRIPTION'
      }, { status: 400 });
    }

    if (!amount_cents || typeof amount_cents !== 'number' || amount_cents <= 0) {
      return NextResponse.json({ 
        error: 'Valid amount_cents is required',
        code: 'INVALID_AMOUNT'
      }, { status: 400 });
    }

    if (!category_id || typeof category_id !== 'number') {
      return NextResponse.json({ 
        error: 'Valid category_id is required',
        code: 'INVALID_CATEGORY'
      }, { status: 400 });
    }

    if (!day_of_month || typeof day_of_month !== 'number' || day_of_month < 1 || day_of_month > 28) {
      return NextResponse.json({ 
        error: 'day_of_month must be between 1 and 28',
        code: 'INVALID_DAY_OF_MONTH'
      }, { status: 400 });
    }

    const categoryExists = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, category_id))
      .limit(1);

    if (categoryExists.length === 0) {
      return NextResponse.json({ 
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      }, { status: 400 });
    }

    const now = new Date().toISOString();
    const newExpense = await db
      .insert(recurringExpenses)
      .values({
        description: description.trim(),
        vendor: vendor ? vendor.trim() : null,
        amountCents: Math.round(amount_cents),
        categoryId: category_id,
        dayOfMonth: day_of_month,
        active: active !== undefined ? Boolean(active) : true,
        createdAt: now,
        nextRunDate: null
      })
      .returning();

    const result = await db
      .select({
        id: recurringExpenses.id,
        userId: recurringExpenses.userId,
        description: recurringExpenses.description,
        vendor: recurringExpenses.vendor,
        amountCents: recurringExpenses.amountCents,
        categoryId: recurringExpenses.categoryId,
        dayOfMonth: recurringExpenses.dayOfMonth,
        nextRunDate: recurringExpenses.nextRunDate,
        active: recurringExpenses.active,
        createdAt: recurringExpenses.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault
        }
      })
      .from(recurringExpenses)
      .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
      .where(eq(recurringExpenses.id, newExpense[0].id))
      .limit(1);

    return NextResponse.json(result[0], { status: 201 });
  } catch (error) {
    console.error('POST recurring expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid id parameter is required',
        code: 'INVALID_ID'
      }, { status: 400 });
    }

    const body = await request.json();
    const { description, vendor, amount_cents, category_id, day_of_month, active } = body;

    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        return NextResponse.json({ 
          error: 'Invalid description',
          code: 'INVALID_DESCRIPTION'
        }, { status: 400 });
      }
    }

    if (amount_cents !== undefined) {
      if (typeof amount_cents !== 'number' || amount_cents <= 0) {
        return NextResponse.json({ 
          error: 'Invalid amount_cents',
          code: 'INVALID_AMOUNT'
        }, { status: 400 });
      }
    }

    if (category_id !== undefined) {
      if (typeof category_id !== 'number') {
        return NextResponse.json({ 
          error: 'Invalid category_id',
          code: 'INVALID_CATEGORY'
        }, { status: 400 });
      }

      const categoryExists = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, category_id))
        .limit(1);

      if (categoryExists.length === 0) {
        return NextResponse.json({ 
          error: 'Category not found',
          code: 'CATEGORY_NOT_FOUND'
        }, { status: 400 });
      }
    }

    if (day_of_month !== undefined) {
      if (typeof day_of_month !== 'number' || day_of_month < 1 || day_of_month > 28) {
        return NextResponse.json({ 
          error: 'day_of_month must be between 1 and 28',
          code: 'INVALID_DAY_OF_MONTH'
        }, { status: 400 });
      }
    }

    const existing = await db
      .select({ id: recurringExpenses.id })
      .from(recurringExpenses)
      .where(eq(recurringExpenses.id, parseInt(id)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ 
        error: 'Recurring expense not found',
        code: 'NOT_FOUND'
      }, { status: 404 });
    }

    const updates: any = {
      updatedAt: new Date().toISOString()
    };

    if (description !== undefined) updates.description = description.trim();
    if (vendor !== undefined) updates.vendor = vendor ? vendor.trim() : null;
    if (amount_cents !== undefined) updates.amountCents = Math.round(amount_cents);
    if (category_id !== undefined) updates.categoryId = category_id;
    if (day_of_month !== undefined) updates.dayOfMonth = day_of_month;
    if (active !== undefined) updates.active = Boolean(active);

    const updated = await db
      .update(recurringExpenses)
      .set(updates)
      .where(eq(recurringExpenses.id, parseInt(id)))
      .returning();

    const result = await db
      .select({
        id: recurringExpenses.id,
        userId: recurringExpenses.userId,
        description: recurringExpenses.description,
        vendor: recurringExpenses.vendor,
        amountCents: recurringExpenses.amountCents,
        categoryId: recurringExpenses.categoryId,
        dayOfMonth: recurringExpenses.dayOfMonth,
        nextRunDate: recurringExpenses.nextRunDate,
        active: recurringExpenses.active,
        createdAt: recurringExpenses.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault
        }
      })
      .from(recurringExpenses)
      .leftJoin(categories, eq(recurringExpenses.categoryId, categories.id))
      .where(eq(recurringExpenses.id, parseInt(id)))
      .limit(1);

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('PATCH recurring expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid id parameter is required',
        code: 'INVALID_ID'
      }, { status: 400 });
    }

    const deleted = await db
      .delete(recurringExpenses)
      .where(eq(recurringExpenses.id, parseInt(id)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Recurring expense not found',
        code: 'NOT_FOUND'
      }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Recurring expense deleted successfully',
      deleted: deleted[0]
    });
  } catch (error) {
    console.error('DELETE recurring expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}