-- CreateTable
CREATE TABLE "Request" (
    "id" SERIAL NOT NULL,
    "awsRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);
