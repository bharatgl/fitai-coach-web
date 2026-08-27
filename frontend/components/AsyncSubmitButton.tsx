"use client";

import { Button, type ButtonProps } from "@fitai/ui";
import { useFormStatus } from "react-dom";

type AsyncSubmitButtonProps = Omit<ButtonProps, "busy" | "children" | "type"> & {
  label: string;
  pendingLabel: string;
};

export function AsyncSubmitButton({
  label,
  pendingLabel,
  ...props
}: AsyncSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button {...props} type="submit" busy={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}
