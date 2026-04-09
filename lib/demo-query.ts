export type DemoTodo = {
  userId: number;
  id: number;
  title: string;
  completed: boolean;
};

export const demoTodosQueryKey = ["demo", "todos"] as const;

export async function fetchDemoTodos(): Promise<DemoTodo[]> {
  const res = await fetch(
    "https://jsonplaceholder.typicode.com/todos?_limit=6",
  );
  if (!res.ok) throw new Error("Failed to load todos");
  return res.json() as Promise<DemoTodo[]>;
}
