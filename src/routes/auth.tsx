import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "Studio Sign In — OnySnow Studios" },
    { name: "description", content: "Sign in to manage the OnySnow Studios website." },
    { property: "og:title", content: "Studio Sign In — OnySnow Studios" },
    { property: "og:description", content: "Private sign in for the OnySnow Studios site manager." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/admin", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/admin", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signIn() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error("Could not sign in", { description: error.message });
  }

  async function signUp() {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    setBusy(false);
    if (error) toast.error("Could not create the account", { description: error.message });
    else toast.success("Account created", { description: "Check your email if confirmation is required, then sign in." });
  }

  async function google() {
    try {
      await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    } catch {
      toast.error("Google sign in is unavailable right now.");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-5 py-20">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3"><Camera className="size-6 text-primary" /><p className="font-display text-3xl">OnySnow Studios</p></div>
        <h1 className="mt-6 font-display text-5xl leading-none">Studio sign in</h1>
        <p className="mt-3 text-sm text-muted-foreground">Private access for managing the website.</p>

        <Button variant="outline" size="lg" className="mt-8 w-full" onClick={google}>Continue with Google</Button>

        <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />or email<span className="h-px flex-1 bg-border" /></div>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" className="h-12" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" className="h-12" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" variant="cinematic" size="lg" className="w-full" disabled={busy || !email || !password}>
            {busy ? <Loader2 className="animate-spin" /> : "Sign in"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" disabled={busy || !email || !password} onClick={signUp}>
            Create my studio account
          </Button>
        </form>
      </div>
    </main>
  );
}
