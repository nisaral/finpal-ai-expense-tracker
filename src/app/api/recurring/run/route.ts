import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, recurringExpenses, categories } from '@/db/schema';
import { eq, and, or, isNull, lte } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDay = today.getDate();

    // Find all due recurring expenses
    const dueRecurringExpenses = await db
      .select({
        id: recurringExpenses.id,
        description: recurringExpenses.description,
        vendor: recurringExpenses.vendor,
        amountCents: recurringExpenses.amountCents,
        categoryId: recurringExpenses.categoryId,
        dayOfMonth: recurringExpenses.dayOfMonth,
        userId: recurringExpenses.userId,
        nextRunDate: recurringExpenses.nextRunDate,
      })
      .from(recurringExpenses)
      .where(
        and(
          eq(recurringExpenses.active, true),
          or(
            and(
              lte(recurringExpenses.nextRunDate, todayStr)
            ),
            and(
              isNull(recurringExpenses.nextRunDate),
              eq(recurringExpenses.dayOfMonth, todayDay)
            )
          )
        )
      );

    if (dueRecurringExpenses.length === 0) {
      return NextResponse.json({
        created: 0,
        transactions: [],
        message: 'No due recurring expenses found'
      });
    }

    const createdTransactions = [];
    
    // Process each due recurring expense
    for (const recurringExpense of dueRecurringExpenses) {
      try {
        // Create transaction
        const newTransaction = await db
          .insert(transactions)
          .values({
            userId: recurringExpense.userId,
            date: todayStr,
            description: recurringExpense.description,
            vendor: recurringExpense.vendor,
            amountCents: recurringExpense.amountCents,
            categoryId: recurringExpense.categoryId,
            createdAt: new Date().toISOString(),
          })
          .returning();

        // Calculate next run date
        let nextRunDate: string;
        
        if (recurringExpense.nextRunDate) {
          // If nextRunDate was set, calculate next month
          const nextMonthDate = new Date(recurringExpense.nextRunDate);
          nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
          nextRunDate = nextMonthDate.toISOString().split('T')[0];
        } else {
          // If nextRunDate was null and matched by day, set next month this day
          const nextMonthDate = new Date(today);
          nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
          nextMonthDate.setDate(recurringExpense.dayOfMonth);
          nextRunDate = nextMonthDate.toISOString().split('T')[0];
        }

        // Update recurring expense with next run date
        await db
          .update(recurringExpenses)
          .set({
            nextRunDate: nextRunDate,
          })
          .where(eq(recurringExpenses.id, recurringExpense.id));

        // Get category details
        const categoryData = await db
          .select({
            id: categories.id,
            name: categories.name,
            emoji: categories.emoji,
            color: categories.color,
          })
          .from(categories)
          .where(eq(categories.id, recurringExpense.categoryId))
          .limit(1);

        // Add transaction with category details to results
        createdTransactions.push({
          ...newTransaction[0],
          category: categoryData[0] || null,
        });

      } catch (error) {
        console.error(`Failed to process recurring expense ${recurringExpense.id}:`, error);
        // Continue processing other recurring expenses even if one fails
      }
    }

    return NextResponse.json({
      created: createdTransactions.length,
      transactions: createdTransactions,
    });

  } catch (error) {
    console.error('Recurring run error:', error);
    return NextResponse.json(
      { error: 'Failed to execute recurring transactions' },
      { status: 500 }
    );
  }
}