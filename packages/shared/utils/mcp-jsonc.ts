export function parseMcpJsonConfigContent(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) {
    return {};
  }
  return JSON.parse(stripJsoncSyntax(trimmed));
}

function stripJsoncSyntax(content: string): string {
  return stripTrailingJsonCommas(stripJsonComments(content));
}

function stripJsonComments(content: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (index < content.length && !/[\r\n]/.test(content[index])) {
        index += 1;
      }
      output += content[index] ?? "";
      continue;
    }

    if (char === "/" && next === "*") {
      index += 2;
      while (
        index < content.length &&
        !(content[index] === "*" && content[index + 1] === "/")
      ) {
        index += 1;
      }
      index += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function stripTrailingJsonCommas(content: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === ",") {
      let lookahead = index + 1;
      while (/\s/.test(content[lookahead] ?? "")) {
        lookahead += 1;
      }
      if (content[lookahead] === "}" || content[lookahead] === "]") {
        continue;
      }
    }

    output += char;
  }

  return output;
}
