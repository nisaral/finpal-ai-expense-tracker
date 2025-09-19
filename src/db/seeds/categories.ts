import { db } from '@/db';
import { categories } from '@/db/schema';

async function main() {
    const defaultCategories = [
        {
            name: 'Eating Out',
            emoji: '🍽️',
            color: '#FF6B6B',
            isDefault: true,
        },
        {
            name: 'Groceries',
            emoji: '🛒',
            color: '#4ECDC4',
            isDefault: true,
        },
        {
            name: 'Transport',
            emoji: '🚗',
            color: '#45B7D1',
            isDefault: true,
        },
        {
            name: 'Entertainment',
            emoji: '🎬',
            color: '#96CEB4',
            isDefault: true,
        },
        {
            name: 'Bills & Utilities',
            emoji: '📄',
            color: '#FFEAA7',
            isDefault: true,
        },
        {
            name: 'Shopping',
            emoji: '🛍️',
            color: '#DDA0DD',
            isDefault: true,
        },
        {
            name: 'Health',
            emoji: '⚕️',
            color: '#98D8C8',
            isDefault: true,
        },
        {
            name: 'Travel',
            emoji: '✈️',
            color: '#F7DC6F',
            isDefault: true,
        },
        {
            name: 'Education',
            emoji: '📚',
            color: '#BB8FCE',
            isDefault: true,
        },
        {
            name: 'Other',
            emoji: '📦',
            color: '#AED6F1',
            isDefault: true,
        }
    ];

    await db.insert(categories).values(defaultCategories);
    
    console.log('✅ Categories seeder completed successfully');
}

main().catch((error) => {
    console.error('❌ Seeder failed:', error);
});