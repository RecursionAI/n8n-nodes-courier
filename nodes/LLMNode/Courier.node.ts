import {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class Courier implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Courier LLM',
		name: 'courier',
		icon: 'fa:cube',
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
						action: 'Load or unload a model (Toggle)',
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
				default: 'llama-3-8b',
				required: true,
				displayOptions: {
					show: {
						operation: ['manage'],
					},
				},
				description: 'The specific model identifier',
			},
			{
				displayName: 'Quantization',
				name: 'quantization',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['manage'],
						manageAction: ['load'],
					},
				},
				options: [
					{ name: 'Q4_0', value: 'q4_0' },
					{ name: 'Q4_K_M', value: 'q4_k_m' },
					{ name: 'Q5_K_M', value: 'q5_k_m' },
					{ name: 'Q8_0', value: 'q8_0' },
					{ name: 'F16', value: 'f16' },
				],
				default: 'q4_k_m',
				description: 'Memory compression level',
			},

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
		let baseUrl = credentials.baseUrl as string;

		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1);
		}

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;
				let endpoint = '';
				let body: IDataObject = {};

				if (operation === 'manage') {
					const action = this.getNodeParameter('manageAction', i) as string;
					const modelName = this.getNodeParameter('modelName', i) as string;

					if (action === 'load') {
						endpoint = '/model/load';
						const quantization = this.getNodeParameter('quantization', i) as string;
						body = {
							model_id: modelName,
							quantization: quantization,
						};
					} else {
						endpoint = '/model/unload';
						body = {
							model_id: modelName,
						};
					}
				}

				if (operation === 'chat') {
					endpoint = '/v1/chat/completions';
					const prompt = this.getNodeParameter('prompt', i) as string;
					const systemPrompt = this.getNodeParameter('systemPrompt', i) as string;

					body = {
						messages: [
							{ role: 'system', content: systemPrompt },
							{ role: 'user', content: prompt },
						],
						stream: false,
					};
				}

				// Fix 2: Removed 'OptionsWithUri' dependency. Used standard IDataObject.
				const options: IDataObject = {
					method: 'POST',
					uri: `${baseUrl}${endpoint}`,
					body: body,
					json: true,
				};

				const response = await this.helpers.requestWithAuthentication.call(
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
