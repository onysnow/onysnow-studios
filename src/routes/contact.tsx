import { createFileRoute } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Instagram, Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { PageIntro } from "@/components/site/PageIntro";
import { copy, pageCopyQuery, settingsQuery } from "@/lib/content";
import { supabase } from "@/integrations/supabase/client";

const schema=z.object({name:z.string().min(2,"Please enter your name."),email:z.string().email("Please enter a valid email."),kind:z.string().min(2,"Tell me what kind of session you need."),message:z.string().min(10,"Please share a little more about your idea.")});
type Values=z.infer<typeof schema>;

export const Route=createFileRoute("/contact")({head:()=>({meta:[{title:"Contact — OnySnow Studios"},{name:"description",content:"Contact OnySnow Studios about photography sessions, events, and creative commissions."},{property:"og:title",content:"Contact — OnySnow Studios"},{property:"og:description",content:"Start a conversation about your next photography project."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Contact});

function Contact(){
  const { data: text, isPending } = useQuery(pageCopyQuery("contact"));
  const { data: settings } = useQuery(settingsQuery);
  const form=useForm<Values>({resolver:zodResolver(schema),defaultValues:{name:"",email:"",kind:"",message:""}});

  const send = useMutation({
    mutationFn: async (values: Values) => {
      const { error } = await supabase.from("inquiries").insert(values);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Message sent", { description: "Thank you — I’ll reply personally." }); form.reset(); },
    onError: () => toast.error("That didn’t send", { description: "Please try again, or email the studio directly." }),
  });

  return <>
    <PageIntro loading={isPending} eyebrow={copy(text,"intro_eyebrow","Contact")} title={copy(text,"intro_title","Tell me what you’re imagining.")} body={copy(text,"intro_body","")}/>
    <section className="px-5 pb-28 sm:px-8 lg:px-12"><div className="mx-auto grid max-w-screen-xl gap-14 lg:grid-cols-[.7fr_1.3fr]">
      <aside className="space-y-8">
        {settings?.["contact_email"] ? <div className="flex gap-4"><Mail className="size-5 text-primary"/><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Email</p><a className="mt-2 block" href={`mailto:${settings["contact_email"]}`}>{settings["contact_email"]}</a></div></div> : null}
        {settings?.["phone"] ? <div className="flex gap-4"><Phone className="size-5 text-primary"/><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Phone</p><p className="mt-2">{settings["phone"]}</p></div></div> : null}
        {settings?.["service_area"] ? <div className="flex gap-4"><MapPin className="size-5 text-primary"/><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Service area</p><p className="mt-2">{settings["service_area"]}</p></div></div> : null}
        {settings?.["instagram_url"] ? <div className="flex gap-4"><Instagram className="size-5 text-primary"/><div><p className="text-xs uppercase tracking-widest text-muted-foreground">Social</p><a className="mt-2 block" href={settings["instagram_url"]}>Instagram</a></div></div> : null}
      </aside>
      <Form {...form}><form onSubmit={form.handleSubmit((v)=>send.mutate(v))} className="grid gap-6 sm:grid-cols-2" noValidate>
        <FormField control={form.control} name="name" render={({field})=><FormItem><FormLabel>Name</FormLabel><FormControl><Input className="h-12" placeholder="Your name" {...field}/></FormControl><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="email" render={({field})=><FormItem><FormLabel>Email</FormLabel><FormControl><Input className="h-12" type="email" placeholder="you@example.com" {...field}/></FormControl><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="kind" render={({field})=><FormItem className="sm:col-span-2"><FormLabel>What are you planning?</FormLabel><FormControl><Input className="h-12" placeholder="Event, portrait, creative shoot…" {...field}/></FormControl><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="message" render={({field})=><FormItem className="sm:col-span-2"><FormLabel>Tell me more</FormLabel><FormControl><Textarea className="min-h-40" placeholder="The mood, date, location, and anything else that matters" {...field}/></FormControl><FormMessage/></FormItem>}/>
        <Button type="submit" variant="cinematic" size="lg" disabled={send.isPending} className="sm:col-span-2 sm:justify-self-start">{send.isPending ? "Sending…" : "Send inquiry"}</Button>
      </form></Form>
    </div></section>
  </>;
}
