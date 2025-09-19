import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { budgets, categories, categoryBudgets } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    // Get userId from query parameter since we don't have auth yet
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    
    // Get budget settings
    const budgetQuery = userId 
      ? db.select().from(budgets).where(eq(budgets.userId, parseInt(userId)))
      : db.select().from(budgets);
    
    const budgetResult = await budgetQuery.limit(1);
    let budget = budgetResult[0];
    
    // If no budget exists, create default one
    if (!budget) {
      const newBudget = {
        userId: userId ? parseInt(userId) : null,
        totalMonthlyBudgetCents: null,
        cycleStartDay: 1,
        createdAt: new Date().toISOString()
      };
      
      const created = await db.insert(budgets)
        .values(newBudget)
        .returning();
      
      budget = created[0];
    }
    
    // Get category budgets
    const categoryBudgetsQuery = userId
      ? await db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, parseInt(userId)))
      : await db.select().from(categoryBudgets);
    
    const categoryBudgetsData = categoryBudgetsQuery;
    
    // Get category details for each category budget
    let categoryIds = categoryBudgetsData.map(cb => cb.categoryId);
    
    // Remove any null/undefined values
    categoryIds = categoryIds.filter(id => id != null);
    
    let categoryDetails: any[] = [];
    if (categoryIds.length > 0) {
      categoryDetails = await db.select()
        .from(categories)
        .where(inArray(categories.id, categoryIds));
    }
    
    // Map category budgets with category details
    const categoryBudgetsWithCategories = categoryBudgetsData.map(cb => {
      const categoryDetail = categoryDetails.find(c => c.id === cb.categoryId);
      return {
        category_id: cb.categoryId,
        monthly_limit_cents: cb.monthlyLimitCents,
        category: categoryDetail ? {
          id: categoryDetail.id,
          name: categoryDetail.name,
          emoji: categoryDetail.emoji,
          color: categoryDetail.color
        } : null
      };
    });
    
    return NextResponse.json({
      total_monthly_budget_cents: budget.totalMonthlyBudgetCents,
      cycle_start_day: budget.cycleStartDay,
      category_budgets: categoryBudgetsWithCategories.filter(cb => cb.category !== null)
    });
    
  } catch (error) {
    console.error('Budgets GET error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Get userId from query parameter since we don't have auth yet
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    
    const body = await request.json();
    const { total_monthly_budget_cents, cycle_start_day, category_budgets } = body;
    
    // Validate cycle_start_day if provided
    if (cycle_start_day !== undefined && cycle_start_day !== null) {
      if (typeof cycle_start_day !== 'number' || cycle_start_day < 1 || cycle_start_day > 28) {
        return NextResponse.json({ 
          error: 'cycle_start_day must be between 1 and 28',
          code: 'INVALID_CYCLE_START_DAY'
        }, { status: 400 });
      }
    }
    
    // Validate category_budgets if provided
    if (category_budgets !== undefined && category_budgets !== null) {
      if (!Array.isArray(category_budgets)) {
        return NextResponse.json({ 
          error: 'category_budgets must be an array',
          code: 'INVALID_CATEGORY_BUDGETS_FORMAT'
        }, { status: 400 });
      }
      
      // Validate each category budget
      for (const cb of category_budgets) {
        if (typeof cb.category_id !== 'number' || cb.category_id <= 0) {
          return NextResponse.json({ 
            error: 'category_id must be a positive integer',
            code: 'INVALID_CATEGORY_ID'
          }, { status: 400 });
        }
        
        if (typeof cb.monthly_limit_cents !== 'number' || cb.monthly_limit_cents < 0) {
          return NextResponse.json({ 
            error: 'monthly_limit_cents must be a non-negative integer',
            code: 'INVALID_MONTHLY_LIMIT'
          }, { status: 400 });
        }
      }
      
      // Check if all categories exist
      const categoryIds = category_budgets.map(cb => cb.category_id);
      const existingCategories = await db.select()
        .from(categories)
        .where(inArray(categories.id, categoryIds));
      
      const existingCategoryIds = new Set(existingCategories.map(c => c.id));
      const invalidCategories = categoryIds.filter(id => !existingCategoryIds.has(id));
      
      if (invalidCategories.length > 0) {
        return NextResponse.json({ 
          error: `Categories not found: ${invalidCategories.join(', ')}`,
          code: 'CATEGORIES_NOT_FOUND'
        }, { status: 400 });
      }
    }
    
    // Get existing budget
    const existingBudgetQuery = userId
      ? await db.select().from(budgets).where(eq(budgets.userId, parseInt(userId)))
      : await db.select().from(budgets);
      
    const existingBudget = existingBudgetQuery[0];
    
    let budgetId;
    
    if (existingBudget) {
      // Update existing budget
      const updates: any = {};
      if (total_monthly_budget_cents !== undefined) updates.totalMonthlyBudgetCents = total_monthly_budget_cents;
      if (cycle_start_day !== undefined) updates.cycleStartDay = cycle_start_day;
      
      await db.update(budgets)
        .set(updates)
        .where(eq(budgets.id, existingBudget.id));
        
      budgetId = existingBudget.id;
    } else {
      // Create new budget
      const newBudget = await db.insert(budgets)
        .values({
          userId: userId ? parseInt(userId) : null,
          totalMonthlyBudgetCents: total_monthly_budget_cents || null,
          cycleStartDay: cycle_start_day || 1,
          createdAt: new Date().toISOString()
        })
        .returning();
        
      budgetId = newBudget[0].id;
    }
    
    // Handle category budgets if provided
    if (category_budgets !== undefined && category_budgets !== null) {
      // Delete existing category budgets for this user
      if (userId) {
        await db.delete(categoryBudgets).where(eq(categoryBudgets.userId, parseInt(userId)));
      } else {
        await db.delete(categoryBudgets);
      }
      
      // Insert new category budgets
      if (category_budgets.length > 0) {
        const categoryBudgetsData = category_budgets.map(cb => ({
          userId: userId ? parseInt(userId) : null,
          categoryId: cb.category_id,
          monthlyLimitCents: cb.monthly_limit_cents,
          createdAt: new Date().toISOString()
        }));
        
        await db.insert(categoryBudgets).values(categoryBudgetsData);
      }
    }
    
    // Return updated budget structure
    const updatedBudgetQuery = userId
      ? db.select().from(budgets).where(eq(budgets.userId, parseInt(userId)))
      : db.select().from(budgets);
    
    const updatedBudget = await updatedBudgetQuery.limit(1).then(r => r[0]);
    
    const updatedCategoryBudgets = userId
      ? await db.select().from(categoryBudgets).where(eq(categoryBudgets.userId, parseInt(userId)))
      : await db.select().from(categoryBudgets);
    
    const categoryIds = updatedCategoryBudgets.map(cb => cb.categoryId);
    let categoryDetails: any[] = [];
    
    if (categoryIds.length > 0) {
      categoryDetails = await db.select()
        .from(categories)
        .where(inArray(categories.id, categoryIds));
    }
    
    const categoryBudgetsWithCategories = updatedCategoryBudgets.map(cb => {
      const categoryDetail = categoryDetails.find(c => c.id === cb.categoryId);
      return {
        category_id: cb.categoryId,
        monthly_limit_cents: cb.monthlyLimitCents,
        category: categoryDetail ? {
          id: categoryDetail.id,
          name: categoryDetail.name,
          emoji: categoryDetail.emoji,
          color: categoryDetail.color
        } : null
      };
    });
    
    return NextResponse.json({
      total_monthly_budget_cents: updatedBudget?.totalMonthlyBudgetCents || null,
      cycle_start_day: updatedBudget?.cycleStartDay || 1,
      category_budgets: categoryBudgetsWithCategories.filter(cb => cb.category !== null)
    });
    
  } catch (error) {
    console.error('Budgets PUT error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}