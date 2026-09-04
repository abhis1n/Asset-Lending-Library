/*
  Warnings:

  - Made the column `dueDate` on table `loans` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "loans" ALTER COLUMN "dueDate" SET NOT NULL;
