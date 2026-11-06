import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixHullcity() {
  console.log('Fixing Hullcity in standings...');

  // Get the player's actual team name
  const { data: profile } = await supabase
    .from('profiles')
    .select('custom_team_name, squad_name, manager_handle')
    .eq('id', 'a4cd55fb-70e8-46e8-8ceb-63cc73b4c86c')
    .single();

  console.log('Player profile:', profile);

  const actualTeamName = profile?.custom_team_name || profile?.squad_name || 'Unassigned';
  console.log('Setting team to:', actualTeamName);

  // Update the standings
  const { error } = await supabase
    .from('standings')
    .update({ team_name: actualTeamName })
    .eq('id', '0a382d30-6af9-4db1-ad68-fd1ee194818b');

  if (error) {
    console.error('Error updating standings:', error);
    process.exit(1);
  }

  console.log('✅ Successfully updated Hullcity to:', actualTeamName);
}

fixHullcity();
