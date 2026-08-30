-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LIBRARIAN', 'MEMBER');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('REQUESTED', 'ISSUED', 'RETURNED', 'LOST');

-- CreateEnum
CREATE TYPE "LoanHistoryType" AS ENUM ('REQUESTED', 'ISSUED', 'RETURNED', 'LOST');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "identifyingCode" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "borrowerId" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "status" "LoanStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_histories" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "type" "LoanHistoryType" NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "loan_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custodians" (
    "itemId" INTEGER NOT NULL,
    "librarianId" INTEGER NOT NULL,

    CONSTRAINT "custodians_pkey" PRIMARY KEY ("itemId","librarianId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "items_identifyingCode_key" ON "items"("identifyingCode");

-- CreateIndex
CREATE INDEX "items_archived_idx" ON "items"("archived");

-- CreateIndex
CREATE INDEX "items_category_idx" ON "items"("category");

-- CreateIndex
CREATE INDEX "loans_itemId_idx" ON "loans"("itemId");

-- CreateIndex
CREATE INDEX "loans_borrowerId_idx" ON "loans"("borrowerId");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "loans_dueDate_idx" ON "loans"("dueDate");

-- CreateIndex
CREATE INDEX "loans_requestedAt_idx" ON "loans"("requestedAt");

-- CreateIndex
CREATE INDEX "loans_status_dueDate_idx" ON "loans"("status", "dueDate");

-- CreateIndex
CREATE INDEX "loan_histories_loanId_createdAt_idx" ON "loan_histories"("loanId", "createdAt");

-- CreateIndex
CREATE INDEX "loan_histories_userId_idx" ON "loan_histories"("userId");

-- CreateIndex
CREATE INDEX "custodians_librarianId_idx" ON "custodians"("librarianId");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_histories" ADD CONSTRAINT "loan_histories_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_histories" ADD CONSTRAINT "loan_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodians" ADD CONSTRAINT "custodians_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custodians" ADD CONSTRAINT "custodians_librarianId_fkey" FOREIGN KEY ("librarianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
