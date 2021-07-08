/* eslint-disable @typescript-eslint/naming-convention */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import axios, { AxiosResponse } from 'axios';
import { flatten } from 'flat';
import * as vscode from 'vscode';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	/**
	 * JSON translations
	 */
	let translations: { [key: string]: string } | null;

	/**
	 * Extension ccnfiguration
	 */
	let apiKey: string;
	let baseUrl: string;
	let project: string;
	let component: string;
	let ngxTranslate: boolean;
	let defaultLanguage: string;

	/**
	 * Get settings vars
	 */
	const setup = () => {
		const config = vscode.workspace.getConfiguration('weblate');
		apiKey = config.get('apiKey') as string;
		baseUrl = config.get('baseUrl') as string;
		project = config.get('project') as string;
		component = config.get('component') as string;
		ngxTranslate = config.get('ngxTranslate') as boolean;
		defaultLanguage = config.get('defaultLanguage') as string;

		/**
		 * Remove current translations
		 */
		translations = null;
	};

	/**
	 * On config change => reload settings
	 */
	vscode.workspace.onDidChangeConfiguration(event => {
		let affected = event.affectsConfiguration("weblate");
		if (affected) {
			setup();
		}
	});

	setup();

	/**
	 * Get user selection
	 */
	const getUserSelection = () => {

		/**
		 * Get active text editor
		 */
		const editor = vscode.window.activeTextEditor;

		/**
		 * No active text editor
		 */
		if (!editor) { return null; }

		/**
		 * Get the selected text
		 */
		const start = new vscode.Position(editor.selection.start.line, editor.selection.start.character);
		const end = new vscode.Position(editor.selection.end.line, editor.selection.end.character);
		return editor.document.getText(new vscode.Range(start, end));
	};

	/**
	 * Replace the selected text with the key of the translation
	 */
	const replaceWithKey = (key: string) => {

		/**
		 * Get active text editor
		 */
		const editor = vscode.window.activeTextEditor;

		/**
		 * No active text editor
		 */
		if (!editor) { return null; }

		/**
		 * Edit file
		 */
		editor.edit((editBuilder: vscode.TextEditorEdit) => {

			/**
			 * They lost focus of the file?
			 * Can't continue!
			 */
			if (!editor?.selection) {
				vscode.window.showErrorMessage('No text selection nor cursor found, could not replace the text with thekey');
				return;
			}

			/**
			 * Set the text we're gonna use to replace the selection
			 */
			let text: string = key;
			if (ngxTranslate) {
				if (vscode.languages.match('typescript', editor?.document)) {

					/**
					 * Get the variables to make an hypothetic selection in which we select the previous character and the next
					 */
					const start = new vscode.Position(editor.selection.start.line, editor.selection.start.character - 1);
					const end = new vscode.Position(editor.selection.end.line, editor.selection.end.character + 1);
					const selectionText = editor.document.getText(new vscode.Range(start, end));

					/**
					 * String selected so we must remove the \" \' too
					 */
					if (new RegExp(/^[\'\"].*\n*[\'\"]$/, 'gm').test(selectionText)) {
						editor.selection = new vscode.Selection(editor.selection.start.translate(0, -1), editor.selection.end.translate(0, 1));
					}

					/**
					 * Typescript string
					 */
					text = 'this.translate.instant(\'' + key + '\')';
				} else if (vscode.languages.match('html', editor?.document)) {

					/**
					 * HTML string
					 */
					text = '{{ \'' + key + '\'|translate }}';
				}
			}

			/**
			 * Replace selection or insert the text
			 */
			editor?.selections.forEach((selection: vscode.Selection) => {
				if (selection.isEmpty) {
					editBuilder.insert(selection.active, text);
				} else {
					editBuilder.replace(selection, text);
				}
			});
		});
	};

	/**
	 * Create command
	 */
	context.subscriptions.push(vscode.commands.registerCommand('weblate.create', () => {

		/**
		 * Get user selection
		 */
		const selection = getUserSelection();

		/**
		 * No user selection
		 */
		if (!selection) {
			vscode.window.showWarningMessage('No text selection found, select a text to create a new translation');
			return;
		}

		/**
		 * Show input to create the new key
		 */
		vscode.window.showInputBox({
			title: 'New key for the selected text',
			// value: constantCase(selection as string)
			value: selection as string
		}).then((key: string | undefined) => {

			/**
			 * Empty string sent
			 */
			if (!key) {
				vscode.window.showWarningMessage('Mission aborted, no entries have been created');
				return;
			}

			/**
			 * Create URL
			 */
			const url = baseUrl + '/api/translations/' + project + '/' + component + '/' + defaultLanguage + '/units/';

			/**
			 * Log
			 */
			vscode.window.showInformationMessage('Sending request to ' + url + '. for more info https://docs.weblate.org/en/latest/api.html#post--api-translations-(string-project)-(string-component)-(string-language)-units-');

			/**
			 * HTTP request, create new entry
			 */
			axios.post(url, 'key=' + key + '&value=' + selection, {
				headers: {
					"Authorization": 'Token ' + apiKey,
					'Content-Type': 'application/x-www-form-urlencoded'
				}
			})
				.then(() => {

					/**
					 * Success message
					 */
					vscode.window.showInformationMessage('Succefully created ' + key + ' entry with ' + selection + ' as value');

					/**
					 * Replace selected text with key
					 */
					replaceWithKey(key);

					/**
					 * Reset the Translations json
					 */
					translations = null;
				})
				.catch((error: any) => {

					/**
					 * Log the error
					 */
					console.error(error);
					vscode.window.showErrorMessage('Error adding the new translation, for more info view the console log');
				});
		});

	}));

	/**
	 * Search command
	 */
	context.subscriptions.push(vscode.commands.registerCommand('weblate.search', () => {

		/**
		 * Show dropdown function (basically a continue)
		 */
		const showDropdown = () => {

			/**
			 * Prepare the quickpick items for the picker
			 */
			let items: vscode.QuickPickItem[] = [];
			for (const key in translations) {
				if (Object.prototype.hasOwnProperty.call(translations, key)) {
					items.push({
						label: translations[key] as string,
						detail: key
					});
				}
			}

			/**
			 * Show picker to choose the translation
			 */
			vscode.window.showQuickPick(items, {
				title: 'Select the desired translation/key to paste the key in the document',
				ignoreFocusOut: true,
				matchOnDetail: true,
			})
				.then((item: vscode.QuickPickItem | undefined) => {

					/**
					 * Operation aborted
					 */
					if (!item) {
						vscode.window.showWarningMessage('Mission aborted, no key was pasted');
						return;
					}

					/**
					 * Replace selected text with key
					 */
					replaceWithKey(item.detail as string);
				});
		};

		/**
		 * If translations not loaded
		 */
		if (!translations) {

			/**
			 * Create URL
			 */
			const url = baseUrl + '/api/translations/' + project + '/' + component + '/' + defaultLanguage + '/file/';

			/**
			 * Log
			 */
			vscode.window.showInformationMessage('Sending request to ' + url + '. for more info https://docs.weblate.org/en/latest/api.html#get--api-translations-(string-project)-(string-component)-(string-language)-file-');

			/**
			 * HTTP request, fetch translations
			 */
			axios.get(url, {
				headers: {
					"Authorization": 'Token ' + apiKey
				}
			})
				.then((response: AxiosResponse<JSON>) => {

					/**
					 * Set translations
					 */
					translations = flatten(response.data);

					/**
					 * Continue
					 */
					showDropdown();
				})
				.catch((error: any) => {

					/**
					 * Log the error
					 */
					console.error(error);
					vscode.window.showErrorMessage('Error fetching translations, for more info view the console log');
				});
		} else {

			/**
			 * Continue
			 */
			showDropdown();
		}
	}));
}

// this method is called when your extension is deactivated
export function deactivate() { }
