function fn() {
  return { baseUrl: java.lang.System.getenv('QA_BASE_URL') || 'http://127.0.0.1:4311' };
}
