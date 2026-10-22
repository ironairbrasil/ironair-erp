UPDATE "Expense"
SET "isFixed" = true
WHERE "description" ~* 'sal[aá]rio'
  AND LOWER("category") <> 'imposto';

UPDATE "Expense"
SET "schedule" = 'FIXED', "installments" = 1
WHERE "isFixed" = false
  AND LOWER("category") <> 'imposto';
