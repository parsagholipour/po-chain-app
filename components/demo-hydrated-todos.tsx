"use client";

import { demoTodosQueryKey, fetchDemoTodos, type DemoTodo } from "@/lib/demo-query";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";

export function DemoHydratedTodos() {
  const { data, isFetching, dataUpdatedAt } = useQuery<DemoTodo[]>({
    queryKey: demoTodosQueryKey,
    queryFn: fetchDemoTodos,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>TanStack Query (hydrated)</CardTitle>
        <CardDescription>
          Prefetched on the server, then managed on the client.{" "}
          {isFetching ? (
            <span className="text-primary">Refreshing…</span>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          Last updated:{" "}
          {dataUpdatedAt
            ? new Date(dataUpdatedAt).toLocaleTimeString()
            : "—"}
        </p>
        <ul className="space-y-2">
          {data?.map((todo) => (
            <li
              key={todo.id}
              className="flex items-start gap-2 rounded-md border border-border/80 bg-card/50 p-2"
            >
              {todo.completed ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1">{todo.title}</span>
              <Badge variant="secondary">#{todo.id}</Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
