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

export class CourierLlm implements INodeType {
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

				let baseUrl = credentials.baseUrl as string;
				if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

				const responseData = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'courierApi',
					{
						method: 'GET',
						url: `${baseUrl}/get-workbench-models/`,
						json: true,
					},
				);

				const items = (responseData.models as IDataObject[]) || [];
				const returnData: INodePropertyOptions[] = [];

				for (const item of items) {
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

				const endpoint = '/inference/';
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

				const body: IDataObject = {
					model_name: modelData.name,
					model_id: modelData.id,
					model_type: modelData['type'],
					api_key: credentials.apiKey,
					temperature: 0.8,
					messages: messages, // Standard text messages
					stream: true,
				};

				// Logic to handle Vision Models
				// Instead of modifying messages, we add 'image_bytes' to the root body
				// const isVisionModel = modelData['type'] === 'image-text-text';
				// const hasImages = images.length > 0;

				// if (isVisionModel && hasImages) {
				// 	body.image_bytes = images;
				// }

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: `${baseUrl}${endpoint}`,
					body: body,
					json: true,
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `${credentials.apiKey}`,
					},
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'courierApi',
					options,
				);

				const responseData = response as IDataObject;
				const result: IDataObject = { ...responseData };

				// Map 'content' to 'output' to make it compatible with standard n8n chat handling
				if (responseData.content) {
					result.output = responseData.content;
				}

				returnData.push({
					json: result,
				});
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
