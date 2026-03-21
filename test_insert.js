const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://uyseheucqikgcorrygzc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5c2VoZXVjcWlrZ2NvcnJ5Z3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NDcxMzIsImV4cCI6MjA4OTQyMzEzMn0._O9Wb2duZKRo9kSU_K_9sEl-7wEeQlEeR1GBuCSRVdI';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
    console.log("Testing insert with batizado...");
    const { data, error } = await supabase.from('leads').insert([{
        workspace_id: '00000000-0000-0000-0000-000000000000',
        name: 'Test Visitor',
        type: 'visitor',
        batizado: 'Católico'
    }]).select();
    console.log(error ? error : "Success!");
}
test();
