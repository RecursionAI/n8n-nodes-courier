import { IDataObject, IExecuteFunctions, IHttpRequestOptions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';

export class CourierLoraConfig implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Courier LoRA Config',
		name: 'courierLoraConfig',
		icon: 'file:recursion_logo.svg',
		group: ['transform'],
		version:1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Fetch and/or customize LoRA fine-tuning configuration and generate YAML',
		defaults: {
			name: 'Courier LoRA Config',
		},
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
// Operation// ----------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Generate Config',
						value: 'generateConfig',
						action:
							'Fetch existing LoRA config (if any), apply overrides, and output YAML',
					},
				],
				default: 'generateConfig',
			},

// ----------------------------------
// Base Config// ----------------------------------
			{
				displayName: 'Dataset ID',
				name: 'datasetId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						operation: ['generateConfig'],
					},
				},
				description: 'Dataset identifier used to fetch or associate a LoRA config',
			},
			{
				displayName: 'Fetch Existing Config from Backend',
				name: 'fetchRemoteConfig',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['generateConfig'],
					},
				},
				description:
					'Whether to GET the existing LoRA config from the backend for this dataset and use it as the base config',
			},
			{
				displayName: 'Fail if No Remote Config',
				name: 'failIfNoRemote',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['generateConfig'],
						fetchRemoteConfig: [true],
					},
				},
				description:
					'If enabled and no config is found remotely, the node will throw an error instead of using local defaults',
			},

// ----------------------------------
// Paths// ----------------------------------
			{
				displayName: 'New Adapter Path',
				name: 'newAdapterPath',
				type: 'string',
				default: '/path/to/new/adapter',
				required: true,
				displayOptions: {
					show: {
						operation: ['generateConfig'],
					},
				},
				description:
					'Filesystem or storage path where the new adapter will be written (used as adapter_path in YAML)',
			},
			{
				displayName: 'Resume Adapter (Optional)',
				name: 'resumeAdapter',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						operation: ['generateConfig'],
					},
				},
				description:
					'Base directory of an existing adapter. If provided, the YAML will contain resume_adapter_file: "<path>/adapters.safetensors".',
			},

// ----------------------------------
// Overrides// ----------------------------------
			{
				displayName: 'Use Overrides?',
				name: 'useOverrides',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						operation: ['generateConfig'],
					},
				},
				description:
					'If enabled, the values specified below will override the base config (remote or defaults)',
			},
			{
				displayName: 'Override Values',
				name: 'overrides',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: false,
				},
				displayOptions: {
					show: {
						operation: ['generateConfig'],
						useOverrides: [true],
					},
				},
				default: {},
				options: [
					{
						name: 'values',
						displayName: 'Values',
						values: [
// Training
							{
							displayName: 'Model',
							name: 'model',
							type: 'string',
							default: '',
							description: 'If set, overrides the model name used in the LoRA config',
							},
							{
							displayName: 'Iterations (iters)',
							name: 'iters',
							type: 'number',
							default:0,
							description:
						'If >0, overrides the number of iterations for fine-tuning',
							},
							{
							displayName: 'Number of Layers (num_layers)',
							name: 'num_layers',
							type: 'number',
								default:0,
							},
							{
							displayName: 'Batch Size',
							name: 'batch_size',
							type: 'number',
							default:0,
							},
							{
							displayName: 'Learning Rate',
							name: 'learning_rate',
							type: 'number',
							typeOptions: {
							numberPrecision:10,
							},
								default:0,
							},
							{
							displayName: 'Train Target (train)',
							name: 'train',
							type: 'string',
							default: '',
							description: 'Backend-specific train selector (e.g. "all", "decoder", etc.)',
							},
							{
							displayName: 'Max Sequence Length',
							name: 'max_seq_length',
							type: 'number',
							default:0,
							},
							{
							displayName: 'Validation Batches',
							name: 'val_batches',
							type: 'number',
							default:0,
							},
// LoRA parameters
							{
							displayName: 'Rank',
							name: 'rank',
							type: 'number',
							default:0,
							},
							{
							displayName: 'Alpha',
							name: 'alpha',
							type: 'number',
							default:0,
							},
							{
							displayName: 'Scale',
							name: 'scale',
							type: 'number',
							default:0,
							},
							{
							displayName: 'Dropout',
							name: 'dropout',
							type: 'number',
							typeOptions: {
							numberPrecision:6,
							},
								default: -1, // use -1 to mean "no override"
							},
						],
					},
				],
description:
	'Only non-empty / non-zero values are applied on top of the base configuration',
},
],
};

async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
	const items = this.getInputData();
	const returnData: INodeExecutionData[] = [];

const credentials = await this.getCredentials('courierApi');
let baseUrl = credentials.baseUrl as string;
if (baseUrl.endsWith('/')) {
	baseUrl = baseUrl.slice(0, -1);
}

for (let i =0; i < items.length; i++) {
	try {
		const operation = this.getNodeParameter('operation', i) as string;

		if (operation === 'generateConfig') {
			const datasetId = this.getNodeParameter('datasetId', i) as string;
			const fetchRemoteConfig = this.getNodeParameter(
				'fetchRemoteConfig',
				i,
			) as boolean;
			const failIfNoRemote = this.getNodeParameter(
				'failIfNoRemote',
				i,
			) as boolean;

			const newAdapterPath = this.getNodeParameter(
				'newAdapterPath',
				i,
			) as string;
			const resumeAdapter =
				(this.getNodeParameter('resumeAdapter', i) as string) || '';

			const useOverrides = this.getNodeParameter('useOverrides', i) as boolean;
			const overridesWrapper = (this.getNodeParameter(
				'overrides.values',
				i,
				{},
			) as IDataObject) || {};

//1. Build base config: from remote if requested, else defaults	let baseConfig: IDataObject = {};

			if (fetchRemoteConfig) {
				const configUrl = `${baseUrl}/get-lora-config/${datasetId}/`;

				const reqOptions: IHttpRequestOptions = {
					method: 'GET',
					url: configUrl,
					json: true,
				};

				try {
					const remoteConfig = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'courierApi',
						reqOptions,
					)) as IDataObject;

// If your API may return null/404-equivalent JSON, handle here	if (!remoteConfig || Object.keys(remoteConfig).length ===0) {
					if (failIfNoRemote) {
						throw new Error(
							`No remote LoRA config found for dataset_id=${datasetId}`,
						);
					}
// fallback to empty (will rely on overrides / defaults)
				} else {
					baseConfig = remoteConfig;
				}
			} catch (err) {
				if (failIfNoRemote) {
					throw err;
				}
// If request failed but we don't fail hard, fall back to empty config}
			}

// Optionally, you can seed baseConfig with defaults if it's still empty:
			if (Object.keys(baseConfig).length ===0) {
				baseConfig = {
					model: 'llama-3-8b',
					iters:1000,
					num_layers:16,
					batch_size:4,
					learning_rate:0.0001,
					train: 'all',
					max_seq_length:2048,
					val_batches:10,
					rank:8,
					alpha:16,
					scale:1,
					dropout:0.0,
				};
			}

//2. Apply overrides on top of base config	let finalConfig: IDataObject = { ...baseConfig, dataset_id: datasetId };

			if (useOverrides) {
				for (const [key, value] of Object.entries(overridesWrapper)) {
// Only override when the value is "meaningful"
					if (
						value !== '' &&
						value !== null &&
						value !== undefined &&
						!(typeof value === 'number' && value ===0) &&
						!(key === 'dropout' && value === -1)
					) {
						finalConfig[key] = value;
					}
				}
			}

//3. Attach adapter paths into config	finalConfig.adapter_path = newAdapterPath;
			finalConfig.resume_adapter = resumeAdapter || null;

//4. Build YAML string	const yaml = buildLoraYaml(finalConfig, newAdapterPath, resumeAdapter);

//5. Output	returnData.push({
			json: {
				dataset_id: datasetId,
					yaml,
					config: finalConfig,
					new_adapter_path: newAdapterPath,
					resume_adapter: resumeAdapter || null,
			},
		});
	}
} catch (error: any) {
	if (this.continueOnFail()) {
		returnData.push({
			json: {
				error: error.message,
			},
		});
		continue;
	}
	throw error;
}
}

return [returnData];
}
}

/**
 * Helper to construct YAML string, mirroring your Python template.
 */
function buildLoraYaml(
	config: IDataObject,
	newAdapterPath: string,
	resumeAdapter: string,
): string {
	const escapeQuotes = (v: unknown) => String(v ?? '').replace(/"/g, '\\"');

	const model = escapeQuotes(config.model);
	const iters = config.iters ??0;
	const numLayers = config.num_layers ??0;
	const batchSize = config.batch_size ??0;
	const learningRate = config.learning_rate ??0;
	const train = config.train ?? 'all';
	const maxSeqLength = config.max_seq_length ??0;
	const valBatches = config.val_batches ??0;

	const rank = config.rank ??0;
	const alpha = config.alpha ??0;
	const scale = config.scale ??1;
	const dropout = config.dropout ??0;

	const adapterPathEscaped = escapeQuotes(newAdapterPath);

	const resumeLine =
		resumeAdapter && resumeAdapter.trim().length >0? `resume_adapter_file: "${escapeQuotes(
				resumeAdapter,
			)}/adapters.safetensors"`
			: '';

	const lines: string[] = [];

	lines.push(`model: "${model}"`);
	lines.push(`data: "dataset"`);
	lines.push(`iters: ${iters}`);
	lines.push(`num_layers: ${numLayers}`);
	lines.push(`batch_size: ${batchSize}`);
	lines.push(`learning_rate: ${learningRate}`);
	lines.push(`adapter_path: "${adapterPathEscaped}"`);
	lines.push(`train: ${train}`);
	lines.push(`max_seq_length: ${maxSeqLength}`);
	lines.push(`val_batches: ${valBatches}`);
	lines.push('');

	if (resumeLine) {
		lines.push(resumeLine);
		lines.push('');
	}

	lines.push('lora_parameters:');
	lines.push(' keys: ["self_attn.q_proj", "self_attn.v_proj"]');
	lines.push(` rank: ${rank}`);
	lines.push(` alpha: ${alpha}`);
	lines.push(` scale: ${scale}`);
	lines.push(` dropout: ${dropout}`);

	return lines.join('\n');
}