import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, budgets } from '@/db/schema';
import { eq, gte, lt, sql, desc, asc, and, or, isNull } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get('period');
    const cycleStartDayParam = searchParams.get('cycleStartDay');
    const categoryId = searchParams.get('categoryId');

    // Validate required parameters
    if (!period || !['thisMonth', 'lastMonth', 'currentCycle'].includes(period)) {
      return NextResponse.json({ 
        error: "Valid period is required (thisMonth, lastMonth, currentCycle)",
        code: "INVALID_PERIOD"
      }, { status: 400 });
    }

    let cycleStartDay = 1;
    if (period === 'currentCycle') {
      if (!cycleStartDayParam || isNaN(parseInt(cycleStartDayParam))) {
        return NextResponse.json({ 
          error: "Valid cycleStartDay is required for currentCycle period",
          code: "MISSING_CYCLE_START_DAY" 
        }, { status: 400 });
      }
      cycleStartDay = Math.max(1, Math.min(28, parseInt(cycleStartDayParam)));
    }

    if (categoryId && isNaN(parseInt(categoryId))) {
      return NextResponse.json({ 
        error: "Valid categoryId is required",
        code: "INVALID_CATEGORY_ID" 
      }, { status: 400 });
    }

    let startDate: Date;
    let endDate: Date;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const day = now.getDate();

    switch (period) {
      case 'thisMonth':
        startDate = new Date(year, month, 1);
        endDate = new Date(year, month + 1, 1);
        break;
      case 'lastMonth':
        startDate = new Date(year, month - 1, 1);
        endDate = new Date(year, month, 1);
        break;
      case 'currentCycle':
        if (day >= cycleStartDay) {
          // Current cycle: this month's cycle day to next month's cycle day
          startDate = new Date(year, month, cycleStartDay);
          endDate = new Date(year, month + 1, cycleStartDay);
        } else {
          // Current cycle: last month's cycle day to this month's cycle day
          startDate = new Date(year, month - 1, cycleStartDay);
          endDate = new Date(year, month, cycleStartDay);
        }
        break;
      default:
        return NextResponse.json({ 
          error: "Invalid period specified",
          code: "INVALID_PERIOD" 
        }, { status: 400 });
    }

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Build where conditions
    const whereConditions = [
      gte(transactions.date, startDateStr),
      lt(transactions.date, endDateStr)
    ];

    if (categoryId) {
      whereConditions.push(eq(transactions.categoryId, parseInt(categoryId)));
    }

    // Get total spent for the period
    const totalQuery = db.select({
      total: sql<number>`COALESCE(sum(${transactions.amountCents}), 0)`
    })
    .from(transactions)
    .where(and(...whereConditions));

    const totalResult = await totalQuery.execute();
    const totalSpentCents = totalResult[0]?.total || 0;

    // Get spending by category
    const categoryQuery = db.select({
      categoryId: transactions.categoryId,
      name: categories.name,
      spentCents: sql<number>`sum(${transactions.amountCents})`
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...whereConditions))
    .groupBy(transactions.categoryId, categories.name)
    .orderBy(desc(sql<number>`sum(${transactions.amountCents})`));

    const categoryResults = await categoryQuery.execute();

    // Get top 5 expenses
    const topExpensesQuery = db.select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amountCents: transactions.amountCents,
      categoryId: categories.id,
      categoryName: categories.name
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...whereConditions))
    .orderBy(desc(transactions.amountCents))
    .limit(5);

    const topExpensesResults = await topExpensesQuery.execute();

    // Calculate burn rate
    const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const burnRateCentsPerDay = daysInPeriod > 0 ? Math.round(totalSpentCents / daysInPeriod) : 0;

    // Format response
    const summary = {
      period_info: {
        period,
        start_date: startDateStr,
        end_date: endDateStr,
        cycle_start_day: cycleStartDay,
        days_in_period: daysInPeriod
      },
      totals: {
        spent_cents: totalSpentCents,
        by_category: categoryResults.map(cat => ({
          category_id: cat.categoryId,
          name: cat.name,
          spent_cents: cat.spentCents
        }))
      },
      top_expenses: topExpensesResults.map(expense => ({
        id: expense.id,
        date: expense.date,
        description: expense.description,
        amount_cents: expense.amountCents,
        category: {
          id: expense.categoryId,
          name: expense.categoryName
        }
      })),
      burn_rate_cents_per_day: burnRateCentsPerDay
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summaries GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}