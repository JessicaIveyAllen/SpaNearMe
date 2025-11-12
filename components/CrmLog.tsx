import React from 'react';
import { CrmLead } from '../types';
import { UserPlusIcon } from './icons';

interface CrmLogProps {
  leads: CrmLead[];
}

export const CrmLog: React.FC<CrmLogProps> = ({ leads }) => {
  return (
    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center">
        <UserPlusIcon className="w-5 h-5 mr-2 text-gray-500" />
        CRM Lead Creation Log
      </h3>
      {leads.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Leads created via conversation will appear here.
        </p>
      ) : (
        <ul className="space-y-2 max-h-40 overflow-y-auto">
          {leads.map((lead, index) => (
            <li key={index} className="bg-white dark:bg-gray-700/50 p-3 rounded-lg shadow-sm">
              <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                      <span className="font-semibold">Name:</span> {lead.fullName}
                    </p>
                    <p className="text-xs text-gray-800 dark:text-gray-200">
                      <span className="font-semibold">Phone:</span> {lead.phoneNumber}
                    </p>
                     <p className="text-xs text-gray-800 dark:text-gray-200">
                      <span className="font-semibold">Email:</span> {lead.email}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {lead.timestamp}
                  </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};