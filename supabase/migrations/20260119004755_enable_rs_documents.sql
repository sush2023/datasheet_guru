-- Add users to documents table
alter table documents
add column user_id uuid references auth.users(id) not null; 
-- Enable RLS 
alter table documents enable row level security;

create policy "Read Access for specific user"
ON documents
for all 
to authenticated
using (auth.uid() = user_id )
with check(auth.uid() = user_id)
