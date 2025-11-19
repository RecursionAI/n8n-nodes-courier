import {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	IHttpRequestOptions,
	INodeTypeDescription,
} from 'n8n-workflow';

export class CourierLlm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Courier LLM',
		name: 'courierLlm',
		icon: 'file:recursion_logo.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with Courier Local or Cloud APIs',
		defaults: {
			name: 'Courier LLM',
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
			// ----------------------------------
			//         Operations
			// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Chat',
						value: 'chat',
						action: 'Chat with a model',
					},
					{
						name: 'Manage Model',
						value: 'manage',
						action: 'Load or unload a model toggle',
					},
				],
				default: 'chat',
			},

			// ----------------------------------
			//         Manage (Toggle) Fields
			// ----------------------------------
			{
				displayName: 'Action',
				name: 'manageAction',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				options: [
					{
						name: 'Load Model (Turn On)',
						value: 'load',
					},
					{
						name: 'Unload Model (Turn Off)',
						value: 'unload',
					},
				],
				default: 'load',
				description: 'Add or remove a model from memory',
			},
			{
				displayName: 'Model Name',
				name: 'modelName',
				type: 'string',
				default: '/Volumes/Extreme SSD/models/gemma-3-12b-it-8bit',
				required: true,
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				description: 'Specific LLM this node is using',
			},
			{
				displayName: 'Context Window',
				name: 'contextWindow',
				type: 'number',
				default: 128000,
				required: true,
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				description: 'The context window for the model',
			},
			{
				displayName: 'Adapter Path',
				name: 'adapterPath',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				description: 'If an adapter path is available, select it here',
			},
			// {
			// 	displayName: 'Quantization',
			// 	name: 'quantization',
			// 	type: 'options',
			// 	displayOptions: {
			// 		show: {
			// 			operation: ['manage'],
			// 			manageAction: ['load'],
			// 		},
			// 	},
			// 	// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
			// 	options: [
			// 		{ name: 'F16', value: 'f16' },
			// 		{ name: 'Q8_0', value: 'q8_0' },
			// 		{ name: 'Q5_K_M', value: 'q5_k_m' },
			// 		{ name: 'Q4_K_M', value: 'q4_k_m' },
			// 		{ name: 'Q4_0', value: 'q4_0' },
			// 	],
			// 	default: 'f16',
			// 	description: 'Model Precision',
			// },

			// ----------------------------------
			//         Chat Fields
			// ----------------------------------
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				default: 'You are a helpful assistant.',
				displayOptions: {
					show: {
						operation: ['chat'],
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
						operation: ['chat'],
					},
				},
				description: 'The input text for the LLM',
			},
		],
	};

	// Fix 1: IExecuteFunctions is now imported from n8n-workflow
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const credentials = await this.getCredentials('courierApi');
		const baseUrl = credentials.baseUrl as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let endpoint = '';
				let body: IDataObject = {};

				if (operation === 'manage') {
					const action = this.getNodeParameter('manageAction', i) as string;
					const modelName = this.getNodeParameter('modelName', i) as string;
					const contextWindow = this.getNodeParameter('contextWindow', i) as string;
					const adapterPath = this.getNodeParameter('adapterPath', i) as string;

					if (action === 'load') {
						endpoint = 'add-model/';
						body = {
							model_name: modelName,
							context_window: contextWindow,
							adapter_path: adapterPath,
							api_key: credentials.apiKey,
							model_type: 'text-text',
						};
					} else {
						endpoint = 'delete-model/';
						body = {
							model_name: modelName,
							context_window: contextWindow,
							adapter_path: adapterPath,
							api_key: credentials.apiKey,
						};
					}
				}

				if (operation === 'chat') {
					const modelName = this.getNodeParameter('modelName', i) as string;
					endpoint = 'inference/';
					const prompt = this.getNodeParameter('prompt', i) as string;
					const systemPrompt = this.getNodeParameter('systemPrompt', i) as string;

					body = {
						model_name: modelName,
						api_key: credentials.apiKey,
						temperature: 0.8,
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: prompt },
						],
						stream: false,
					};
				}

				const options: IHttpRequestOptions = {
					method: 'POST',
					url: `${baseUrl}${endpoint}`,
					body: body,
					json: true,
				};

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'courierApi',
					options,
				);

				returnData.push({
					json: response as IDataObject,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: error.message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
