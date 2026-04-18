"use client";

import type { LogisticsPartner } from "@/lib/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StorageObjectImage } from "@/components/ui/storage-object-image";
import { Pencil, Trash2 } from "lucide-react";

interface LogisticsPartnersTableProps {
  partners: LogisticsPartner[];
  isPending?: boolean;
  onEdit: (partner: LogisticsPartner) => void;
  onDelete: (id: string) => void;
}

export function LogisticsPartnersTable({
  partners,
  isPending = false,
  onEdit,
  onDelete,
}: LogisticsPartnersTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Logo</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Link</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending ? (
            <TableRow>
              <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          ) : null}
          {!isPending &&
            partners.map((partner) => (
            <TableRow key={partner.id}>
              <TableCell>
                {partner.logoKey ? (
                  <StorageObjectImage
                    reference={partner.logoKey}
                    className="size-10 bg-muted/20"
                    objectFit="contain"
                    fallback={
                      <div className="flex size-10 items-center justify-center rounded-md bg-muted text-[10px]">
                        Logo
                      </div>
                    }
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-muted/50" />
                )}
              </TableCell>
              <TableCell className="font-medium">{partner.name}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {partner.type === "freight_forwarder" ? "Freight Forwarder" : "Carrier"}
                </Badge>
              </TableCell>
              <TableCell>{partner.contactNumber || "-"}</TableCell>
              <TableCell>
                {partner.link ? (
                  <a
                    href={partner.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Link
                  </a>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>{partner.email || "-"}</TableCell>
              <TableCell>{partner.address || "-"}</TableCell>
              <TableCell className="max-w-[200px] truncate">{partner.notes || "-"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEdit(partner)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(partner.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!isPending && partners.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                No logistics partners found
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
