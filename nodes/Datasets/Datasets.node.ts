import { INodeType, INodeTypeDescription } from 'n8n-workflow';

export class Datasets implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Courier Datasets',
		icon: 'file:recursion_logo.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Interact with Courier Local or Cloud APIs',
		defaults: {
			name: 'Courier LLM',
		},
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
			// Operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Dataset Type',
						value: 'datasetType',
						action: 'Select dataset type',
					}
				],
				default: 'datasetType',
			},
			// Dataset Fields
			{
				displayName: 'Action',
				name: 'manageAction',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['submit conversation dataset'],
					},
				},
				options: [
					{
						name: 'Conversation Dataset',
						value: 'conversation',
					},
				],
				default: 'conversation',
				description: 'Select Conversation Dataset Type'
			}

			// {
			// 	displayName: 'Dataset Fields',
			// 	name: 'datasetFields',
			// 	type: 'json',
			// 	displayOptions: {
			// 		show: {
			// 			operation: ['submit conversation dataset'],
			// 		},
			// 	}
			// }
		]
	}
}