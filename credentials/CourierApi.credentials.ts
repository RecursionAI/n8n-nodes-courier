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
			default: 'ff65aa72-a25f-4928-a733-b5ced486221f',
			description: 'The API Key for authentication',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '{{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'GET',
			// Use the variable so it tests YOUR url
			// Note: This assumes baseUrl ends with a slash /
			url: 'https://uce.ngrok.app/check-validity-status/',
			headers: {
				// Use the variable so it tests YOUR key
				Authorization: '{{$credentials.apiKey}}',
			},
		},
		rules: [
			{
				type: 'responseSuccessBody',
				properties: {
					key: 'response',
					value: true,
					message: 'Credentials Verified and Authorized',
				},
			},
		],
	};

	icon = 'file:recursion_logo.svg' as Icon;
}
