import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  email: z.string().email("That doesn’t look like an email address."),
  // Honeypot: real people leave this empty; most bots fill every field.
  website: z.string().max(0).optional(),
});

type Values = z.infer<typeof schema>;

/**
 * Email capture for the journal. Writes to `subscribers`, which is insert-only
 * for the public — nobody can read the list back without admin rights.
 */
export function SubscribeForm({
  source = "blog",
  variant = "inline",
}: {
  source?: string;
  variant?: "inline" | "banner";
}) {
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", website: "" } });

  async function onSubmit(values: Values) {
    if (values.website) return; // honeypot tripped — fail silently
    const { error } = await supabase.from("subscribers").insert({ email: values.email, source });

    if (error) {
      // A unique violation means they're already on the list; that isn't a failure.
      if (error.code === "23505") {
        setDone(true);
        return;
      }
      toast.error("Couldn’t sign you up", { description: error.message });
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <p className="text-sm text-muted-foreground">
        You’re on the list. New work and writing, occasionally — never spam.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={variant === "banner" ? "max-w-xl" : "max-w-md"}
      noValidate
    >
      <p className="eyebrow">The journal</p>
      <p className="mt-3 text-lg leading-7 text-muted-foreground">
        New photographs and the occasional story behind them. No schedule, no noise.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email address"
          aria-invalid={errors.email ? true : undefined}
          className="h-10"
          {...register("email")}
        />
        {/* Hidden from people and from screen readers; visible to naive bots. */}
        <input
          type="text"
          tabIndex={-1}
          aria-hidden="true"
          autoComplete="off"
          className="hidden"
          {...register("website")}
        />
        <Button type="submit" variant="cinematic" size="lg" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Mail />}
          Subscribe
        </Button>
      </div>
      {errors.email ? <p className="mt-2 text-sm text-destructive">{errors.email.message}</p> : null}
    </form>
  );
}
