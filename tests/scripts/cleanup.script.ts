export function cleanTestDir() {
  try {
    Deno.removeSync("./static", { recursive: true });
  } catch (e) {
    console.log(e.message);
  }
  try {
    Deno.removeSync("./data", { recursive: true });
  } catch (e) {
    console.log(e.message);
  }
  console.log("Test directories cleaned.");
}
