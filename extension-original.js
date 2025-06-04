const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const { default: ollama } = require("ollama");

let linterOutput = "";
let diagnosticCollection =
  vscode.languages.createDiagnosticCollection("diagnosticsLinter");

function runLinter(document) {
  if (document.languageId === "python") {
    linterOutput = "";
    const filePath = document.fileName;
    //console.log(filePath.split("\\").pop());
    fs.readFile(filePath, "utf8", (err, fileContent) => {
      if (err) {
        vscode.window.showErrorMessage(`Failed to read file: ${err.message}`);
        return;
      }

      const linter = spawn(
        "python",
        ["-m", "pylint", "--from-stdin", filePath.split("\\").pop()],
        { shell: true }
      );

      linter.stdin.write(fileContent);
      linter.stdin.end();

      linter.stdout.on("data", (data) => {
        linterOutput += data.toString();
      });

      linter.stderr.on("data", (data) => {
        vscode.window.showErrorMessage(`Pylint Error: ${data.toString()}`);
      });

      linter.on("close", () => {
        let fileUri = vscode.window.activeTextEditor?.document.uri;
        console.log(linterOutput);
        createDiagnostics(fileUri);
      });
    });
  }
}

function createDiagnostics(fileUri) {
  const outputLines = linterOutput.trim().split("\n");
  const parsedErrors = outputLines
    .map((line) => {
      const match = line.match(/:(\d+):(\d+):\s([A-Z]\d{4}):\s(.+)/);

      if (match) {
        const [, lineNo, colNo, errorCode, message] = match;
        let severity = null;

        if (errorCode.startsWith("F") || errorCode.startsWith("E")) {
          severity = vscode.DiagnosticSeverity.Error;
        } else if (errorCode.startsWith("I")) {
          severity = vscode.DiagnosticSeverity.Information;
        } else {
          severity = vscode.DiagnosticSeverity.Warning;
        }

        return {
          line: parseInt(lineNo, 10),
          column: parseInt(colNo, 10),
          message: message.trim(),
          severity,
        };
      }

      return null;
    })
    .filter(Boolean);

  let diagnosticList = [];
  parsedErrors.forEach(({ line, column, message, severity }) => {
    let startPosition = new vscode.Position(line - 1, column);
    let endPosition = new vscode.Position(line - 1, column);
    let range = new vscode.Range(startPosition, endPosition);
    let diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnosticList.push(diagnostic);
  });

  if (fileUri != undefined) {
    diagnosticCollection.set(fileUri, diagnosticList);
  }
}

const PROMPT_1 = `[INST] <<SYS>>
You are a code transformation agent. Your task is to fix syntax errors in the provided Python code based on the given Pylint output. Output only the corrected Python code with no explanations, no commentary, and no Markdown formatting.
<</SYS>>

Python code:
{code}

Pylint output:
{linterOutput}

Instructions:
- Fix only syntax-related errors reported by Pylint (e.g., missing final newline, unnecessary else statements, pointless string statements).
- For pointless string statements, remove them without repurposing their content.
- Retain original variable names and code logic, making only the minimal changes needed to address Pylint syntax errors.
- Ensure a single newline at the end of the file if Pylint reports it missing.
- Output only the corrected Python code.
[/INST]`;

const PROMPT_2 = `[INST] <<SYS>>
You are a code transformation agent. Your task is to fix logical errors in the provided Python code to ensure correct functionality. Output only the corrected Python code with no explanations, no commentary, and no Markdown formatting.
<</SYS>>

Python code:
{code}

Instructions:
- Analyze the code for logical errors (e.g., incorrect algorithms, edge case failures) and fix them to match the intended functionality.
- Preserve the code's structure, variable names, and any existing docstrings or comments unless they contribute to logical errors.
- If the intended functionality is unclear, infer it from the code's context or function names (e.g., a GCD function should compute the greatest common divisor correctly).
- Make minimal changes to achieve correct behavior.
- Output only the corrected Python code.
[/INST]`;

const PROMPT_3 = `[INST] <<SYS>>
You are a documentation agent. Your task is to follow all the instructions to the point. Output only the corrected Python code with no explanations, no commentary, and no Markdown formatting.
<</SYS>>

Python code:
{code}

Instructions:
- Add one module docstring at the beginning in the 1st line.
- For every function definition, add a function docstring.
- Rename every variable with meaningful names.
- Do not add even one line of Python code on your own.
- Do not add any new import statememts
- Output only the corrected Python code.
[/INST]`;

const sys_prompt = `You are a code transformation agent. Your task is to fix logical errors in the provided Python code to ensure correct functionality. Output only the corrected Python code with no explanations and no Markdown formatting.`;
const user_prompt = `Python code:
{code}
{linterOutput}
Instructions:
- Analyze the code for logical errors (e.g., incorrect algorithms, edge case failures) and fix them to match the intended functionality.
- Output only the corrected Python code with no markdown formatting.`;
const SET_TEMPERATURE_PROMPT = `/set parameter temperature 0.1 {code} {linterOutput}`;
const CLEAR_CONTEXT = `/clear {code} {linterOutput}`;
// async function runOllamaPrompt(prompt, code = "", linterOutput = "") {
//   const formattedPrompt = prompt
//     .replace("{code}", code)
//     .replace("{linterOutput}", linterOutput);
//   try {
//     const response = await ollama.chat({
//       model: "codellama",
//       messages: [
//         { role: "system", content: SET_TEMPERATURE_PROMPT },
//         { role: "system", content: sys_prompt },
//         { role: "user", content: formattedPrompt },
//       ],
//     });
//     return response.message.content;
//   } catch (error) {
//     throw new Error(`Error running Ollama prompt: ${error.message}`);
//   }
// }

function extractLastOutput(result) {
  // Find the last occurrence of "Output:"
  const lastOutputIndex = result.lastIndexOf("Output:");
  if (lastOutputIndex === -1) {
    return ""; // Return empty string if "Output:" not found
  }

  // Extract everything after "Output:" and trim whitespace
  return result.substring(lastOutputIndex + "Output:".length).trim();
}
async function runOllamaPrompt(code) {
  const prompt = `[INST] <<SYS>>
You are a strict Python code fixer. The input Python code always contains at least one logical or syntax error. You must identify and correct these. Output only the corrected Python code, with NO extra text or formatting.
<</SYS>>

# Example:
Input:
def is_even(n):
    return n % 2 == 1

Output:
def is_even(n):
    return n % 2 == 0

---

Input:
${code}

Output:
[/INST]`;

  try {
    const response = await ollama.chat({
      model: "codellama",
      options: { temperature: 0.1 },
      messages: [{ role: "user", content: prompt }],
    });

    // Filter out anything that’s not Python code (some models still prepend noise)
    const output = response.message.content.trim();
    const lines = output.split("\n");
    const firstCodeLineIndex = lines.findIndex((line) =>
      line.trim().startsWith("def")
    );
    const cleaned = lines.slice(firstCodeLineIndex).join("\n");

    return cleaned;
  } catch (error) {
    throw new Error(`Error running Ollama prompt: ${error.message}`);
  }
}

async function generateFixedCodeHandler() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor found.");
    return;
  }

  const document = editor.document;
  let code = document.getText();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating fixed code...",
      cancellable: false,
    },
    async (progress) => {
      try {
        // await runOllamaPrompt(CLEAR_CONTEXT);
        // await runOllamaPrompt(SET_TEMPERATURE_PROMPT);
        // // Step 1: Fix Pylint syntax errors
        // progress.report({ message: "Fixing Pylint syntax errors..." });
        // code = await runOllamaPrompt(PROMPT_1, code, linterOutput);

        // await runOllamaPrompt(CLEAR_CONTEXT);
        // await runOllamaPrompt(SET_TEMPERATURE_PROMPT);
        // // Step 2: Fix logical errors
        // progress.report({ message: "Fixing logical errors..." });
        // code = await runOllamaPrompt(PROMPT_2, code);

        // await runOllamaPrompt(CLEAR_CONTEXT);
        // await runOllamaPrompt(SET_TEMPERATURE_PROMPT);
        // // Step 3: Add docstrings and rename variables
        // progress.report({
        //   message: "Adding docstrings and renaming variables...",
        // });
        // code = await runOllamaPrompt(PROMPT_3, code);
        code = await runOllamaPrompt(code);
        code = extractLastOutput(code);
        // Display the final corrected code
        const doc = await vscode.workspace.openTextDocument({
          content: code,
          language: "python",
        });
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error generating fixed code: ${error.message}`
        );
      }
    }
  );
}

function activate(context) {
  console.log('Congratulations, your extension "codesense" is now active!');

  let static_analysis = vscode.workspace.onDidSaveTextDocument((document) => {
    runLinter(document);
  });

  let generateFixedCode = vscode.commands.registerCommand(
    "codesense.generateFixedCode",
    generateFixedCodeHandler
  );

  context.subscriptions.push(generateFixedCode, static_analysis);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
