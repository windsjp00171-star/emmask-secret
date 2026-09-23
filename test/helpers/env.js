// 測試用的假環境變數：只是讓 require 各個 lib 檔案時不會因為缺變數而丟出例外，
// 測試本身不會真的打 LINE / Supabase / Anthropic API。
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= 'test-token';
process.env.LINE_CHANNEL_SECRET ||= 'test-secret';
process.env.LINE_USER_ID ||= 'test-user';
process.env.SUPABASE_URL ||= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_KEY ||= 'test-key';
process.env.ANTHROPIC_API_KEY ||= 'test-key';
