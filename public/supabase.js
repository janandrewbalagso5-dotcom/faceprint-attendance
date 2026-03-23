// supabase.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

export const supabase = createClient(
  "https://elijcrrdpfaczxtgqctp.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsaWpjcnJkcGZhY3p4dGdxY3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODc2NDYsImV4cCI6MjA4NjU2MzY0Nn0.JKJEYrVQrV1cb15T9J48j-4-RgviTmWdz3fqWvioxBo"
);
