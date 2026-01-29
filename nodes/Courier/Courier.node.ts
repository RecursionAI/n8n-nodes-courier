import {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	IHttpRequestOptions,
	INodeTypeDescription,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';

export class Courier implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Courier',
		name: 'courier',
		icon: 'file:courier_logo.svg',
		group: ['transform'],
		version: 1,
		description: 'Interact with Courier Local or Cloud APIs',
		defaults: {
			name: 'Courier',
		},
		// Fix 3: Declare that this node can be used by AI Agents
		usableAsTool: true,
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'courierApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'API Provider',
				name: 'apiProvider',
				type: 'options',
				options: [
					{
						name: 'Courier API (Default)',
						value: 'courier',
						description: 'Use Courier inference API'
					},
					{
						name: 'OpenAI Compatible API',
						value: 'openai',
						description: 'Use OpenAI compatible endpoints'
					}
				],
				default: 'courier',
				description: 'Choose which API provider to use'
			},
			{
				displayName: 'Model Name or ID',
				name: 'model',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getWorkbenchModels',
				},
				default: '',
				required: true,
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			// ----------------------------------
			//         Chat Fields
			// ----------------------------------
			{
				displayName: 'Input Type',
				name: 'promptType',
				type: 'options',
				options: [
					{
						name: 'Text Prompt',
						value: 'text',
					},
					{
						name: 'Chat Messages (JSON)',
						value: 'messages',
					},
				],
				default: 'text',
				description:
					'Choose whether to provide a simple text prompt or a full list of messages (e.g. from a chat widget)',
			},
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				default: 'You are a helpful assistant.',
				displayOptions: {
					show: {
						promptType: ['text'],
					},
				},
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						promptType: ['text'],
					},
				},
				description: 'The input text for the LLM',
			},
			{
				displayName: 'Messages (JSON)',
				name: 'messages',
				type: 'json',
				default: '',
				required: true,
				displayOptions: {
					show: {
						promptType: ['messages'],
					},
				},
				description: 'JSON array of messages (e.g. [{ "role": "user", "content": "hello" }])',
			},
		],
	};

	methods = {
		loadOptions: {
			async getWorkbenchModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('courierApi');
				const apiProvider = this.getNodeParameter('apiProvider', 0) as string || 'courier';

				let baseUrl = credentials.baseUrl as string;
				if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

				let endpoint = '';
				if (apiProvider === 'openai') {
					endpoint = `${baseUrl}/v1/models`;
				} else {
					endpoint = `${baseUrl}/get-workbench-models/`;
				}

				const responseData = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'courierApi',
					{
						method: 'GET',
						url: endpoint,
						json: apiProvider !== 'openai',
					},
				);

				const items = apiProvider === 'openai'
					? responseData.data || []
					: (responseData.models as IDataObject[]) || [];

				const returnData: INodePropertyOptions[] = [];

				for (const item of items) {
					if (apiProvider === 'openai') {
						returnData.push({
							name: `${item.id} (OpenAI)`,
							value: JSON.stringify({
								name: item.id,
								id: item.id,
								type: 'text-text',
								api_type: 'openai'
							}),
						});
					} else {
						returnData.push({
							name: `${item.nickname || item.name} (${item.context_window} | ${item.api_type})`,
							value: JSON.stringify({
								name: item.name,
								id: item.model_id,
								type: item.model_type,
								api_type: item.api_type,
							}),
						});
					}
				}

				return returnData;
			},
		},
	};

	// Fix 1: IExecuteFunctions is now imported from n8n-workflow

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('courierApi');
		let baseUrl = credentials.baseUrl as string;
		if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

		for (let i = 0; i < items.length; i++) {
			try {
				const modelDataString = this.getNodeParameter('model', i) as string;
				let modelData: IDataObject;
				try {
					modelData = JSON.parse(modelDataString) as IDataObject;
					// eslint-disable-next-line @typescript-eslint/no-unused-vars
				} catch (e) {
					// Fallback if user entered a manual string expression that isn't JSON
					modelData = { name: modelDataString, id: null, type: 'text-text' };
				}

				// Inline streaming parser function
				const parseOpenAIStreamingResponse = (responseText: string): IDataObject => {
					let completeResponse = '';
					let modelName = '';
					let usageData = {};
					let promptTokens = 0;
					let generationTokens = 0;
					let peakMemory = 0;

					// Split response into lines and process each chunk
					const lines = responseText.split('\n');
					for (const line of lines) {
						const trimmedLine = line.trim();
						if (trimmedLine.startsWith('data: ')) {
							const chunkData = trimmedLine.substring(6).trim();
							if (chunkData === '[DONE]') {
								break; // Streaming complete
							}

							try {
								const parsedChunk = JSON.parse(chunkData);

								// Extract metadata from any chunk that has it
								if (parsedChunk.model) modelName = parsedChunk.model;
								if (parsedChunk.usage) usageData = parsedChunk.usage;
								if (parsedChunk.prompt_tokens) promptTokens = parsedChunk.prompt_tokens;
								if (parsedChunk.generation_tokens) generationTokens = parsedChunk.generation_tokens;
								if (parsedChunk.peak_memory) peakMemory = parsedChunk.peak_memory;

								// Handle content chunks
								if (parsedChunk.choices && parsedChunk.choices.length > 0) {
									const choice = parsedChunk.choices[0];

									// Handle delta chunks (streaming)
									if (choice.delta && choice.delta.content) {
										completeResponse += choice.delta.content;
									}

									// Handle final complete message (if present)
									if (choice.message && choice.message.content) {
										completeResponse = choice.message.content;
									}
								}
							} catch {
								// Log error using n8n's console (if available)
								// if (this.helpers && this.helpers.) {
								// 	this.helpers.log('Error parsing OpenAI streaming chunk:', e);
								// }
								// Continue processing other chunks
							}
						}
					}

					// Return normalized response format
					return {
						content: completeResponse,
						output: completeResponse,
						model: modelName,
						usage: usageData,
						prompt_tokens: promptTokens,
						generation_tokens: generationTokens,
						peak_memory: peakMemory,
					};
				};

				const apiProvider = this.getNodeParameter('apiProvider', i) as string || 'courier';
				const promptType = this.getNodeParameter('promptType', i) as string;

				let messages: IDataObject[] = [];

				if (promptType === 'messages') {
					// Mode: Chat Messages (JSON)
					const messagesRaw = this.getNodeParameter('messages', i, []) as unknown;
					if (Array.isArray(messagesRaw)) {
						messages = messagesRaw as IDataObject[];
					} else if (typeof messagesRaw === 'string') {
						try {
							messages = JSON.parse(messagesRaw) as IDataObject[];
						} catch (e) {
							// noinspection ExceptionCaughtLocallyJS
							throw new NodeOperationError(
								this.getNode(),
								'Messages input must be a valid JSON array. ' + e.string,
								{ itemIndex: i },
							);
						}
					}
				} else {
					// Mode: Text Prompt
					const prompt = this.getNodeParameter('prompt', i) as string;
					const systemPrompt = this.getNodeParameter('systemPrompt', i) as string;

					if (systemPrompt) {
						messages.push({ role: 'system', content: systemPrompt });
					}

					// const isVisionModel = modelData['type'] === 'image-text-text';

					// if (isVisionModel) {
					// 	messages.push({
					// 		role: 'user',
					// 		content: {
					// 			image_bytes: images,
					// 			text: prompt,
					// 		},
					// 	});
					// } else {
					messages.push({ role: 'user', content: prompt });
					// }
				}

				// Determine endpoint and request format based on API provider
				let endpoint = '';
				let requestBody: IDataObject;

				if (apiProvider === 'openai') {
					endpoint = `${baseUrl}/v1/chat/completions`;

					// OpenAI format
					requestBody = {
						model: modelData.name,
						messages: messages,
						temperature: 0.8,
						stream: true,

					};
				} else {
					endpoint = `${baseUrl}/inference/`;

					// Courier format (current)
					requestBody = {
						model_name: modelData.name,
						model_id: modelData.id,
						model_type: modelData['type'],
						temperature: 0.8,
						messages: messages,
						stream: false,
					};
				}



				// Logic to handle Vision Models
				// Instead of modifying messages, we add 'image_bytes' to the root body
				// const isVisionModel = modelData['type'] === 'image-text-text';
				// const hasImages = images.length > 0;

				// if (isVisionModel && hasImages) {
				// 	body.image_bytes = images;
				// }

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: endpoint,
					body: requestBody,
					json: true,
				};

				// For OpenAI API, we need to override the Authorization header format
				// Courier API uses credential system's raw API_KEY format (which is correct)
				if (apiProvider === 'openai') {
					options.headers = {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${credentials.apiKey}`,
					};
				}

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'courierApi',
					options,
				);

						// Handle response based on API provider
						if (apiProvider === 'openai') {
							// Handle streaming response
							const responseText = typeof response === 'string' ? response : JSON.stringify(response);
							try {
								const parsedResult = parseOpenAIStreamingResponse(responseText);
								returnData.push({
									json: parsedResult,
								});
							} catch (parseError) {
								// console.error('Failed to parse OpenAI streaming response:', parseError);
								throw new NodeOperationError(
									this.getNode(),
									'Failed to parse OpenAI streaming response: ' + parseError.message,
									{ itemIndex: i },
								);
							}
						} else {
					// Courier API response handling (existing behavior)
					const responseData = response as IDataObject;
					const result: IDataObject = { ...responseData };

					// Map 'content' to 'output' to make it compatible with standard n8n chat handling
					if (responseData.content) {
						result.output = responseData.content;
					}

					returnData.push({
						json: result,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = (error as Error).message;
					returnData.push({ json: { error: errorMessage } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
