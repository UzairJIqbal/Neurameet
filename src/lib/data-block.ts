// Wrap a user- or profile-supplied value in a named tag so the model treats it
// as data. Closing-tag text inside the value is neutralised so it cannot break
// out of the block.
export function dataBlock(name: string, value: string): string {
  const safe = value.replace(new RegExp(`</?${name}>`, "gi"), "");
  return `<${name}>\n${safe}\n</${name}>`;
}
