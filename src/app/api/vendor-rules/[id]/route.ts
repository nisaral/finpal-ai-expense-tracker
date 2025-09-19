import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { vendorRules, categories } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ruleId = parseInt(params.id);
    if (isNaN(ruleId)) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    const data = await request.json();
    const { keyword, category_id } = data;

    // Validate at least one field to update
    if (keyword === undefined && category_id === undefined) {
      return NextResponse.json({ 
        error: "At least one field (keyword or category_id) must be provided",
        code: "MISSING_FIELDS" 
      }, { status: 400 });
    }

    // Validate category exists if provided
    if (category_id !== undefined) {
      const categoryExists = await db.select()
        .from(categories)
        .where(eq(categories.id, category_id))
        .limit(1);

      if (categoryExists.length === 0) {
        return NextResponse.json({ 
          error: "Category not found",
          code: "CATEGORY_NOT_FOUND" 
        }, { status: 400 });
      }
    }

    // Process keyword - lowercase and trim
    let processedKeyword;
    if (keyword !== undefined) {
      processedKeyword = keyword.toLowerCase().trim();
    }

    // Build update data
    const updateData: Record<string, any> = {};
    if (processedKeyword !== undefined) updateData.keyword = processedKeyword;
    if (category_id !== undefined) updateData.categoryId = category_id;

    // Check for keyword uniqueness if updating keyword
    if (processedKeyword !== undefined) {
      // First get the existing rule to check userId
      const existingRule = await db.select()
        .from(vendorRules)
        .where(eq(vendorRules.id, ruleId))
        .limit(1);

      if (existingRule.length === 0) {
        return NextResponse.json({ 
          error: "Vendor rule not found",
          code: "RULE_NOT_FOUND" 
        }, { status: 404 });
      }

      const duplicateCheck = await db.select()
        .from(vendorRules)
        .where(
          and(
            eq(vendorRules.userId, existingRule[0].userId),
            eq(vendorRules.keyword, processedKeyword)
          )
        )
        .limit(1);

      if (duplicateCheck.length > 0 && duplicateCheck[0].id !== ruleId) {
        return NextResponse.json({ 
          error: "Another rule with this keyword already exists for this user",
          code: "DUPLICATE_KEYWORD" 
        }, { status: 400 });
      }
    }

    // Update the rule
    const updatedRule = await db.update(vendorRules)
      .set(updateData)
      .where(eq(vendorRules.id, ruleId))
      .returning();

    if (updatedRule.length === 0) {
      return NextResponse.json({ 
        error: "Vendor rule not found",
        code: "RULE_NOT_FOUND" 
      }, { status: 404 });
    }

    // Get category details for response
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
      .where(eq(vendorRules.id, ruleId))
      .limit(1);

    return NextResponse.json(ruleWithCategory[0]);
  } catch (error) {
    console.error('PATCH vendor rule error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ruleId = parseInt(params.id);
    if (isNaN(ruleId)) {
      return NextResponse.json({ 
        error: "Valid ID is required",
        code: "INVALID_ID" 
      }, { status: 400 });
    }

    // Get the rule with category details before deletion
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
      .where(eq(vendorRules.id, ruleId))
      .limit(1);

    if (ruleWithCategory.length === 0) {
      return NextResponse.json({ 
        error: 'Rule not found',
        code: 'RULE_NOT_FOUND'
      }, { status: 404 });
    }

    // Delete the rule
    const deleted = await db
      .delete(vendorRules)
      .where(eq(vendorRules.id, ruleId))
      .returning();

    return NextResponse.json({
      success: true,
      message: 'Vendor rule deleted successfully',
      rule: ruleWithCategory[0]
    });
  } catch (error) {
    console.error('DELETE vendor rule error:', error);
    return NextResponse.json({ 
      error: 'Internal server error: ' + error 
    }, { status: 500 });
  }
}