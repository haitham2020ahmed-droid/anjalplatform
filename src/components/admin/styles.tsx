export function AdminCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      {children}
    </div>
  );
}

export function AdminTitle({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <h1 className="text-xl font-bold">
      {children}
    </h1>
  );
}
export const field =
  "flex flex-col gap-2";

export const label =
  "text-sm font-medium text-gray-700";
