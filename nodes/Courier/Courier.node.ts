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
			{
				displayName: 'Temperature',
				name: 'temperature',
				type: 'number',
				default: 0.2,
				description: 'Controls randomness in model output. Lower values make output more deterministic.',
				typeOptions: {
					minValue: 0,
					maxValue: 2,
					step: 0.1
				}
			},
			{
				displayName: 'Response Format (Optional)',
				name: 'jsonSchema',
				type: 'json',
				default: '{}',
				description: 'Optional response format to enforce structured JSON output using OpenAI-compatible format. Use {"type": "json_schema", "json_schema": {"schema": {...}}} or simple format like {"prop1": "string", "prop2": "number"}. Leave as {} for unconstrained output.',
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
					// Try to handle different model data formats
					let modelName = modelDataString;
					let modelId = null;
					let modelType = 'text-text';

					// Check if it might be a UUID (36 characters with dashes)
					if (modelDataString.length === 36 && modelDataString.includes('-')) {
						// Could be a UUID - try to find a model name pattern
						modelId = modelDataString;
						modelName = 'Unknown Model';
					} else if (modelDataString.includes('|')) {
						// Might be in format "Model Name | Context Window | API Type"
						const parts = modelDataString.split('|');
						modelName = parts[0].trim();
						if (parts.length > 2) {
							modelType = parts[2].trim().toLowerCase() === 'image' ? 'image-text-text' : 'text-text';
						}
					}

					modelData = { 
						name: modelName, 
						id: modelId, 
						type: modelType
					};

					// Validate that we have required model data
					if (!modelData.name || (typeof modelData.name === 'string' && modelData.name.trim() === '')) {
						throw new NodeOperationError(
							this.getNode(),
							'Model name is required',
							{ itemIndex: i },
						);
					}
				}

				// Helper function to transform simple JSON schema to proper JSON Schema format
				const transformSimpleSchema = (simpleSchema: IDataObject): IDataObject | null => {
					if (!simpleSchema || typeof simpleSchema !== 'object') {
						return null;
					}

					// If it already looks like a proper JSON Schema (has 'type', 'properties', etc.)
					if (simpleSchema.type === 'object' && simpleSchema.properties) {
						return simpleSchema;
					}

					// Transform simple format {"prop1": "string", "prop2": "number"} to proper JSON Schema
					const properties: Record<string, IDataObject> = {};
					const required: string[] = [];

					for (const [key, value] of Object.entries(simpleSchema)) {
						if (typeof value === 'string') {
							// Simple type mapping
							const typeMap: Record<string, string> = {
								'string': 'string',
								'number': 'number',
								'integer': 'integer',
								'boolean': 'boolean',
								'array': 'array',
								'object': 'object',
							};
							
							if (typeMap[value]) {
								properties[key] = { type: typeMap[value] };
								required.push(key);
							} else {
								// Assume it's a string if unknown type
								properties[key] = { type: 'string' };
								required.push(key);
							}
						} else if (typeof value === 'object' && value !== null) {
							// Already in proper format
							const valueObj = value as IDataObject;
							properties[key] = valueObj;
							if (!Object.prototype.hasOwnProperty.call(valueObj, 'required') || valueObj.required !== false) {
								required.push(key);
							}
						}
					}

					// Add reasoning/thought field if not present (best practice)
					if (!properties.thought && !properties.reasoning) {
						properties.thought = { type: 'string' };
						required.push('thought');
					}

					return {
						type: 'object',
						properties: properties,
						required: required,
					};
				};



				const apiProvider = this.getNodeParameter('apiProvider', i) as string || 'courier';
				const promptType = this.getNodeParameter('promptType', i) as string;

				let messages: IDataObject[] = [];

				// Extract JSON schema parameter if provided
				const jsonSchemaRaw = this.getNodeParameter('jsonSchema', i) as string;
				let jsonSchema: IDataObject | null = null;

				// Only process if not empty and not just an empty object
				if (jsonSchemaRaw && jsonSchemaRaw.trim() !== '' && jsonSchemaRaw.trim() !== '{}') {
					try {
						const parsedSchema = JSON.parse(jsonSchemaRaw) as IDataObject;
						jsonSchema = transformSimpleSchema(parsedSchema);
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
					} catch (e) {
						// If parsing fails, try to use it as-is (might already be an object)
						if (typeof jsonSchemaRaw === 'object') {
							jsonSchema = transformSimpleSchema(jsonSchemaRaw as unknown as IDataObject);
						} else {
							// Invalid JSON schema, ignore it
							jsonSchema = null;
						}
					}
				} else if (typeof jsonSchemaRaw === 'object') {
					// Handle case where it's already an object (shouldn't happen with our UI, but be safe)
					jsonSchema = transformSimpleSchema(jsonSchemaRaw as unknown as IDataObject);
				}

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
						temperature: this.getNodeParameter('temperature', i) as number,
						stream: false,
					};

					// Add JSON schema for OpenAI format if provided
					if (jsonSchema) {
						requestBody.response_format = {
							type: 'json_schema',
							json_schema: {
								schema: jsonSchema,
							},
						};
					}
				} else {
					endpoint = `${baseUrl}/inference/`;

					// Courier format (current)
					requestBody = {
						model_name: modelData.name,
						model_id: modelData.id,
						model_type: modelData['type'],
						temperature: this.getNodeParameter('temperature', i) as number,
						messages: messages,
						stream: false,
					};

					// Add JSON schema for Courier format if provided
					if (jsonSchema) {
						requestBody.response_format = {
							type: 'json_schema',
							json_schema: {
								schema: jsonSchema,
							},
						};
					}
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

								// Handle standard OpenAI response format
								const responseData = response as IDataObject;
								
								// Extract content from the correct field
								const choices = responseData.choices as IDataObject[] | undefined;
								const firstChoice = choices && choices.length > 0 ? choices[0] : {};
								const message = firstChoice.message as IDataObject | undefined;
								const content = message?.content || '';
								const modelName = responseData.model || '';
								const usageData = responseData.usage || {};
								const usageObj = typeof usageData === 'object' && usageData !== null ? usageData as IDataObject : {};
								const promptTokens = usageObj.prompt_tokens || 0;
								const completionTokens = usageObj.completion_tokens || 0;
								
								// Normalize response format to match Courier API structure
								const parsedResult = {
									content: content,
									output: content,
									model: modelName,
									usage: usageData,
									prompt_tokens: promptTokens,
									generation_tokens: completionTokens,
									peak_memory: 0, // Not provided by OpenAI API
								};
								returnData.push({
									json: parsedResult,
								});
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
