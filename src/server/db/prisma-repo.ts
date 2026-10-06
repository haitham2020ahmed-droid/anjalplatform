export class PrismaRepo {
  prisma: any;

  constructor(prisma?: any) {
    this.prisma = prisma;
  }

  async findUnique(model: string, args: any) {
    return this.prisma?.[model]?.findUnique(args);
  }

  async findMany(model: string, args: any) {
    return this.prisma?.[model]?.findMany(args) ?? [];
  }

  async create(model: string, args: any) {
    return this.prisma?.[model]?.create(args);
  }
}
