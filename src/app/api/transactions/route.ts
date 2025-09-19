import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, splits } from '@/db/schema';
import { eq, like, and, or, desc, asc, between, gte, lte, sql } from 'drizzle-orm';

function getDateRange(period: string, cycleStartDay?: number) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  switch (period) {
    case 'thisMonth':
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0)
      };
    case 'lastMonth':
      return {
        start: new Date(year, month - 1, 1),
        end: new Date(year, month, 0)
      };
    case 'currentCycle':
      if (!cycleStartDay) {
        return null;
      }
      const today = now.getDate();
      let startDate, endDate;
      if (today >= cycleStartDay) {
        startDate = new Date(year, month, cycleStartDay);
        endDate = new Date(year, month + 1, cycleStartDay - 1);
      } else {
        startDate = new Date(year, month - 1, cycleStartDay);
        endDate = new Date(year, month, cycleStartDay - 1);
      }
      return { start: startDate, end: endDate };
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const categoryId = searchParams.get('categoryId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const period = searchParams.get('period');
    const cycleStartDay = searchParams.get('cycleStartDay');
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);
    
    let query = db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        date: transactions.date,
        description: transactions.description,
        vendor: transactions.vendor,
        amountCents: transactions.amountCents,
        categoryId: transactions.categoryId,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault
        }
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id));
    
    const conditions = [];
    
    if (q) {
      conditions.push(
        or(
          like(transactions.description, `%${q}%`),
          like(transactions.vendor, `%${q}%`)
        )
      );
    }
    
    if (categoryId && !isNaN(parseInt(categoryId))) {
      conditions.push(eq(transactions.categoryId, parseInt(categoryId)));
    }
    
    if (dateFrom && dateTo) {
      conditions.push(between(transactions.date, dateFrom, dateTo));
    } else if (dateFrom) {
      conditions.push(gte(transactions.date, dateFrom));
    } else if (dateTo) {
      conditions.push(lte(transactions.date, dateTo));
    }
    
    if (period) {
      const dateRange = getDateRange(period, cycleStartDay ? parseInt(cycleStartDay) : undefined);
      if (dateRange) {
        const startStr = dateRange.start.toISOString().split('T')[0];
        const endStr = dateRange.end.toISOString().split('T')[0];
        conditions.push(between(transactions.date, startStr, endStr));
      }
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    const totalQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(transactions);
    
    if (conditions.length > 0) {
      totalQuery.where(and(...conditions));
    }
    
    const [totalResult] = await totalQuery;
    const total = totalResult.count;
    
    const items = await query
      .orderBy(desc(transactions.date), desc(transactions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    
    return NextResponse.json({
      items,
      total,
      page,
      pageSize
    });
    
  } catch (error) {
    console.error('GET transactions error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, vendor, amount_cents, category_id, date, notes, splits: splitsData } = body;
    
    if (!description || description.trim() === '') {
      return NextResponse.json({ 
        error: 'Description is required',
        code: 'MISSING_DESCRIPTION'
      }, { status: 400 });
    }
    
    if (!amount_cents || isNaN(parseInt(amount_cents))) {
      return NextResponse.json({ 
        error: 'Valid amount_cents is required',
        code: 'INVALID_AMOUNT'
      }, { status: 400 });
    }
    
    if (!category_id || isNaN(parseInt(category_id))) {
      return NextResponse.json({ 
        error: 'Valid category_id is required',
        code: 'INVALID_CATEGORY'
      }, { status: 400 });
    }
    
    if ('userId' in body || 'user_id' in body || 'authorId' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }
    
    const categoryExists = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, parseInt(category_id)))
      .limit(1);
    
    if (categoryExists.length === 0) {
      return NextResponse.json({ 
        error: 'Category not found',
        code: 'CATEGORY_NOT_FOUND'
      }, { status: 400 });
    }
    
    const transactionDate = date || new Date().toISOString().split('T')[0];
    const createdDate = new Date().toISOString();
    
    const newTransaction = await db
      .insert(transactions)
      .values({
        description: description.trim(),
        vendor: vendor?.trim() || null,
        amountCents: parseInt(amount_cents),
        categoryId: parseInt(category_id),
        date: transactionDate,
        notes: notes?.trim() || null,
        createdAt: createdDate
      })
      .returning();
    
    let createdSplits = [];
    if (splitsData && Array.isArray(splitsData) && splitsData.length > 0) {
      const splitValues = splitsData.map(split => ({
        transactionId: newTransaction[0].id,
        participant: split.participant.trim(),
        shareCents: parseInt(split.share_cents)
      }));
      
      createdSplits = await db
        .insert(splits)
        .values(splitValues)
        .returning();
    }
    
    const result = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        date: transactions.date,
        description: transactions.description,
        vendor: transactions.vendor,
        amountCents: transactions.amountCents,
        categoryId: transactions.categoryId,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault
        }
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.id, newTransaction[0].id))
      .limit(1);
    
    return NextResponse.json({
      ...result[0],
      splits: createdSplits
    }, { status: 201 });
    
  } catch (error) {
    console.error('POST transaction error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID'
      }, { status: 400 });
    }
    
    const body = await request.json();
    const { description, vendor, amount_cents, category_id, date, notes } = body;
    
    if ('userId' in body || 'user_id' in body || 'authorId' in body) {
      return NextResponse.json({ 
        error: "User ID cannot be provided in request body",
        code: "USER_ID_NOT_ALLOWED" 
      }, { status: 400 });
    }
    
    const updates: any = {};
    
    if (description !== undefined) {
      if (description.trim() === '') {
        return NextResponse.json({ 
          error: 'Description cannot be empty',
          code: 'EMPTY_DESCRIPTION'
        }, { status: 400 });
      }
      updates.description = description.trim();
    }
    
    if (vendor !== undefined) {
      updates.vendor = vendor?.trim() || null;
    }
    
    if (amount_cents !== undefined) {
      if (isNaN(parseInt(amount_cents))) {
        return NextResponse.json({ 
          error: 'Invalid amount_cents',
          code: 'INVALID_AMOUNT'
        }, { status: 400 });
      }
      updates.amountCents = parseInt(amount_cents);
    }
    
    if (category_id !== undefined) {
      if (isNaN(parseInt(category_id))) {
        return NextResponse.json({ 
          error: 'Invalid category_id',
          code: 'INVALID_CATEGORY'
        }, { status: 400 });
      }
      
      const categoryExists = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, parseInt(category_id)))
        .limit(1);
      
      if (categoryExists.length === 0) {
        return NextResponse.json({ 
          error: 'Category not found',
          code: 'CATEGORY_NOT_FOUND'
        }, { status: 400 });
      }
      
      updates.categoryId = parseInt(category_id);
    }
    
    if (date !== undefined) {
      updates.date = date;
    }
    
    if (notes !== undefined) {
      updates.notes = notes?.trim() || null;
    }
    
    updates.createdAt = new Date().toISOString();
    
    const updated = await db
      .update(transactions)
      .set(updates)
      .where(eq(transactions.id, parseInt(id)))
      .returning();
    
    if (updated.length === 0) {
      return NextResponse.json({ 
        error: 'Transaction not found',
        code: 'NOT_FOUND'
      }, { status: 404 });
    }
    
    const result = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        date: transactions.date,
        description: transactions.description,
        vendor: transactions.vendor,
        amountCents: transactions.amountCents,
        categoryId: transactions.categoryId,
        notes: transactions.notes,
        createdAt: transactions.createdAt,
        category: {
          id: categories.id,
          name: categories.name,
          emoji: categories.emoji,
          color: categories.color,
          isDefault: categories.isDefault
        }
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(eq(transactions.id, parseInt(id)))
      .limit(1);
    
    return NextResponse.json(result[0]);
    
  } catch (error) {
    console.error('PUT transaction error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    
    if (!id || isNaN(parseInt(id))) {
      return NextResponse.json({ 
        error: 'Valid ID is required',
        code: 'INVALID_ID'
      }, { status: 400 });
    }
    
    const deletedSplits = await db
      .delete(splits)
      .where(eq(splits.transactionId, parseInt(id)))
      .returning();
    
    const deleted = await db
      .delete(transactions)
      .where(eq(transactions.id, parseInt(id)))
      .returning();
    
    if (deleted.length === 0) {
      return NextResponse.json({ 
        error: 'Transaction not found',
        code: 'NOT_FOUND'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      message: 'Transaction deleted successfully',
      deleted: deleted[0]
    });
    
  } catch (error) {
    console.error('DELETE transaction error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}