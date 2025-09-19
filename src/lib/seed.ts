import { db } from '@/db';
import { categories, budgets } from '@/db/schema';

export async function seedDefaultCategories(): Promise<number> {
  try {
    const defaultCategories = [
      { name: 'Eating Out', emoji: '🍽️', color: '#FF6B6B', isDefault: true },
      { name: 'Groceries', emoji: '🛒', color: '#4ECDC4', isDefault: true },
      { name: 'Transport', emoji: '🚗', color: '#45B7D1', isDefault: true },
      { name: 'Entertainment', emoji: '🎬', color: '#96CEB4', isDefault: true },
      { name: 'Bills & Utilities', emoji: '📄', color: '#FFEAA7', isDefault: true },
      { name: 'Shopping', emoji: '🛍️', color: '#DDA0DD', isDefault: true },
      { name: 'Health', emoji: '⚕️', color: '#98D8C8', isDefault: true },
      { name: 'Travel', emoji: '✈️', color: '#F7DC6F', isDefault: true },
      { name: 'Education', emoji: '📚', color: '#BB8FCE', isDefault: true },
      { name: 'Other', emoji: '📦', color: '#AED6F1', isDefault: true }
    ];

    const seeded = await db.insert(categories).values(defaultCategories).returning();
    console.log(`✅ Seeded ${seeded.length} default categories`);
    return seeded.length;
  } catch (error) {
    console.error('Error seeding categories:', error);
    throw error;
  }
}

export async function seedDefaultBudgets(): Promise<boolean> {
  try {
    await db.insert(budgets).values({
      userId: null,
      totalMonthlyBudgetCents: null,
      cycleStartDay: 1,
      createdAt: new Date().toISOString()
    });
    
    console.log('✅ Seeded default budget');
    return true;
  } catch (error) {
    console.error('Error seeding budget:', error);
    throw error;
  }
}

export async function seedDatabase(): Promise<{ categories: number; budgets: boolean }> {
  try {
    const categoriesCount = await seedDefaultCategories();
    const budgetsSeeded = await seedDefaultBudgets();
    
    return {
      categories: categoriesCount,
      budgets: budgetsSeeded
    };
  } catch (error) {
    console.error('Database seeding failed:', error);
    throw error;
  }
}