DROP POLICY "Public reads published categories" ON public.categories;
CREATE POLICY "Anon reads published categories" ON public.categories FOR SELECT TO anon USING (published);
CREATE POLICY "Signed in reads categories" ON public.categories FOR SELECT TO authenticated USING (published OR public.is_admin(auth.uid()));

DROP POLICY "Public reads published photos" ON public.photos;
CREATE POLICY "Anon reads published photos" ON public.photos FOR SELECT TO anon USING (published);
CREATE POLICY "Signed in reads photos" ON public.photos FOR SELECT TO authenticated USING (published OR public.is_admin(auth.uid()));

DROP POLICY "Public reads published services" ON public.services;
CREATE POLICY "Anon reads published services" ON public.services FOR SELECT TO anon USING (published);
CREATE POLICY "Signed in reads services" ON public.services FOR SELECT TO authenticated USING (published OR public.is_admin(auth.uid()));

DROP POLICY "Public reads published testimonials" ON public.testimonials;
CREATE POLICY "Anon reads published testimonials" ON public.testimonials FOR SELECT TO anon USING (published);
CREATE POLICY "Signed in reads testimonials" ON public.testimonials FOR SELECT TO authenticated USING (published OR public.is_admin(auth.uid()));

DROP POLICY "Public reads published copy" ON public.page_content;
CREATE POLICY "Anon reads published copy" ON public.page_content FOR SELECT TO anon USING (published);
CREATE POLICY "Signed in reads copy" ON public.page_content FOR SELECT TO authenticated USING (published OR public.is_admin(auth.uid()));

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;