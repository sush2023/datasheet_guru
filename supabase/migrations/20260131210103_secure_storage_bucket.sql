create policy "Secure storage bucket"
on storage.objects
for all
to authenticated
using (bucket_id = 'datasheets' and owner = auth.uid()) 
with check(bucket_id = 'datasheets' and owner = auth.uid()) 
