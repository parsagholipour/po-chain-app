import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
  title: "Super admin",
};

function formatDate(d: Date) {
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SuperAdminPage() {
  const [stores, users] = await Promise.all([
    prisma.store.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { userStores: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        realEmail: true,
        createdAt: true,
        _count: { select: { userStores: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Super admin</h1>
        <p className="text-sm text-muted-foreground">
          All stores and users in the database.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stores</CardTitle>
          <CardDescription>{stores.length} store(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Users</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.slug}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s._count.userStores}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(s.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>{users.length} user(s)</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Real email</TableHead>
                <TableHead className="text-right">Stores</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>{u.name ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {u.realEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {u._count.userStores}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
