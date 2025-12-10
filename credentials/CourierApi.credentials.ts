import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class CourierApi implements ICredentialType {
	name = 'courierApi';
	displayName = 'Courier API';
	documentationUrl = 'https://github.com/RecursionAI/courier_nodes';
	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://uce.ngrok.app/',
			placeholder: 'https://uce.ngrok.app/',
			description: 'The API URL. Use your ngrok URL for local hardware, or the cloud URL.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'The API Key for authentication',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			url: '={{$credentials.baseUrl}}check-validity-status/',
			headers: {
				Authorization: '={{$credentials.apiKey}}',
			},
		},
	};

	icon = 'file:recursion_logo.svg' as Icon;
}
