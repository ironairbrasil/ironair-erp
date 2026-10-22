ALTER TABLE "Expense" ADD COLUMN "isFixed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Expense"
SET "category" = 'Operacional'
WHERE LOWER("category") = 'software';

UPDATE "Expense"
SET "isFixed" = true
WHERE "description" ~* 'sal[aá]rio'
  AND LOWER("category") <> 'imposto';
