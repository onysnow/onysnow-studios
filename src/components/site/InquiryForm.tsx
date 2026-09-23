import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportWriteError } from "@/lib/form-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const schema = z.object({
  name: z.string().min(1, "Please add your name.").max(120),
  email: z.string().email("That doesn’t look like an email address."),
  organisation: z.string().min(1, "Please tell me who this is for.").max(160),
  usage: z.string().min(1, "Please say where the images would be used.").max(300),
  region: z.string().min(1, "A city or region is enough.").max(120),
  message: z.string().min(1, "A sentence or two is plenty.").max(3000),
  website: z.string().max(0).optional(),
});

type Values = z.infer<typeof schema>;

/**
 * A vetted enquiry rather than a booking.
 *
 * Deliberately asks who the client is, where the images would appear, and the
 * general region — enough for Ony to judge an approach before any scheduling
 * happens. Region only; never a precise address.
 */
export function InquiryForm({ kind, successNote }: { kind: string; successNote: string }) {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      organisation: "",
      usage: "",
      region: "",
      message: "",
      website: "",
    },
  });

  async function onSubmit(values: Values) {
    if (values.website) return; // honeypot

    const message = [
      `Organisation / brand: ${values.organisation}`,
      `Intended usage: ${values.usage}`,
      `Region: ${values.region}`,
      "",
      values.message,
    ].join("\n");

    const { error } = await supabase
      .from("inquiries")
      .insert({ name: values.name, email: values.email, kind, message });

    if (error) {
      reportWriteError(error, "Couldn’t send that");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-md border border-border p-8">
        <p className="font-display text-xl">Thank you — that’s with me.</p>
        <p className="mt-4 leading-7 text-muted-foreground">{successNote}</p>
      </div>
    );
  }

  const field = "mt-2 h-10";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${kind}-name`}>Your name</Label>
          <Input
            id={`${kind}-name`}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${kind}-name-error` : undefined}
            className={field}
            autoComplete="name"
            {...register("name")}
          />
          {errors.name ? (
            <p id={`${kind}-name-error`} role="alert" className="mt-2 text-sm text-destructive">
              {errors.name.message}
            </p>
          ) : null}
        </div>
        <div>
          <Label htmlFor={`${kind}-email`}>Email</Label>
          <Input
            id={`${kind}-email`}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${kind}-email-error` : undefined}
            type="email"
            className={field}
            autoComplete="email"
            {...register("email")}
          />
          {errors.email ? (
            <p id={`${kind}-email-error`} role="alert" className="mt-2 text-sm text-destructive">
              {errors.email.message}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <Label htmlFor={`${kind}-org`}>Company, brand or organisation</Label>
        <Input
          id={`${kind}-org`}
          aria-invalid={errors.organisation ? true : undefined}
          aria-describedby={errors.organisation ? `${kind}-org-error` : undefined}
          className={field}
          {...register("organisation")}
        />
        {errors.organisation ? (
          <p id={`${kind}-org-error`} role="alert" className="mt-2 text-sm text-destructive">
            {errors.organisation.message}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${kind}-usage`}>Where would the images be used?</Label>
        <Input
          id={`${kind}-usage`}
          aria-invalid={errors.usage ? true : undefined}
          aria-describedby={errors.usage ? `${kind}-usage-error` : undefined}
          className={field}
          placeholder="Product listing, campaign, social, print…"
          {...register("usage")}
        />
        {errors.usage ? (
          <p id={`${kind}-usage-error`} role="alert" className="mt-2 text-sm text-destructive">
            {errors.usage.message}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${kind}-region`}>City or region</Label>
        <Input
          id={`${kind}-region`}
          aria-invalid={errors.region ? true : undefined}
          aria-describedby={errors.region ? `${kind}-region-error` : undefined}
          className={field}
          {...register("region")}
        />
        {errors.region ? (
          <p id={`${kind}-region-error`} role="alert" className="mt-2 text-sm text-destructive">
            {errors.region.message}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`${kind}-message`}>Tell me about the shoot</Label>
        <Textarea
          id={`${kind}-message`}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? `${kind}-message-error` : undefined}
          rows={5}
          className="mt-2"
          {...register("message")}
        />
        {errors.message ? (
          <p id={`${kind}-message-error`} role="alert" className="mt-2 text-sm text-destructive">
            {errors.message.message}
          </p>
        ) : null}
      </div>

      <input
        type="text"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="hidden"
        {...register("website")}
      />

      <Button type="submit" variant="cinematic" size="lg" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Send enquiry
      </Button>
    </form>
  );
}
