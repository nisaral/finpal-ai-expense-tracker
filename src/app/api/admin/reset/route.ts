import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { splits, transactions, vendorRules, recurringExpenses, categoryBudgets, budgets, categories } from '@/db/schema';
import { seedDatabase } from '@/lib/seed';

function isValidBearerToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const adminToken = process.env.ADMIN_RESET_TOKEN;
  
  if (!adminToken) {
    console.error('ADMIN_RESET_TOKEN environment variable not configured');
    return false;
  }
  
  return token === adminToken;
}

export async function POST(request: NextRequest) {
  try {
    // Validate bearer token
    if (!isValidBearerToken(request)) {
      return NextResponse.json(
        { error: 'Invalid or missing authorization token', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    console.log('🔄 Starting database reset...');

    // Use database transaction for atomicity
    await db.transaction(async (tx) => {
      console.log('Clearing splits table');
      await tx.delete(splits);
      
      console.log('Clearing transactions table');
      await tx.delete(transactions);
      
      console.log('Clearing vendor_rules table');
      await tx.delete(vendorRules);
      
      console.log('Clearing recurring_expenses table');
      await tx.delete(recurringExpenses);
      
      console.log('Clearing category_budgets table');
      await tx.delete(categoryBudgets);
      
      console.log('Clearing budgets table');
      await tx.delete(budgets);
      
      console.log('Clearing categories table');
      await tx.delete(categories);
    });

    console.log('✅ Database cleared successfully');
    console.log('🌱 Seeding default data...');
    
    const seededData = await seedDatabase();

    const response = {
      ok: true,
      seeded: {
        categories: seededData.categories,
        budgets: seededData.budgets
      }
    };

    console.log('🎉 Database reset completed successfully');
    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('❌ Admin reset error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to reset database: ' + (error instanceof Error ? error.message : 'Unknown error'),
        code: 'DATABASE_ERROR'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' },
    { status: 405 }
  );
}