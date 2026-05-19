<?php

/**
 * Controller for administration and user account management.
 */

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

/**
 * User management controller.
 * Handles listing, creating, updating, and deleting users.
 */
class UserController extends Controller
{
    /**
     * Return a list of all users.
     */
    public function index()
    {
        $users = User::select('id', 'name', 'email', 'role', 'active')->orderBy('created_at', 'desc')->get();

        return response()->json([
            'users' => $users,
        ]);
    }

    /**
     * Create a new user account.
     */
    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:6',
            'role' => ['required', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
        ]);

        $user = User::create([
            'name' => $request->input('name'),
            'email' => $request->input('email'),
            'password' => Hash::make($request->input('password')),
            'role' => $request->input('role'),
            'active' => true,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'User created successfully',
            'user' => $user,
        ], 201);
    }

    /**
     * Update the role of an existing user.
     */
    public function update(Request $request, User $user)
    {
        $request->validate([
            'role' => ['sometimes', Rule::in(['admin', 'manager', 'team_lead', 'teamlead', 'member'])],
            'active' => ['sometimes', 'boolean'],
        ]);

        $authUser = $request->user();

        if ($authUser->id === $user->id) {
            return response()->json([
                'status' => false,
                'message' => 'You cannot modify your own account.',
            ], 403);
        }

        if ($user->active === false) {
            return response()->json([
                'status' => false,
                'message' => 'Resigned users cannot be modified.',
            ], 403);
        }

        if ($authUser->role === 'manager' && $user->role === 'admin') {
            return response()->json([
                'status' => false,
                'message' => 'Managers cannot modify administrators.',
            ], 403);
        }

        if ($request->has('role')) {
            $user->role = $request->input('role');
        }

        if ($request->has('active')) {
            $user->active = $request->input('active');
        }

        $user->save();

        return response()->json([
            'status' => true,
            'message' => 'User updated successfully',
            'user' => $user,
        ]);
    }

    /**
     * Delete a user from the system.
     */
    public function destroy(User $user)
    {
        $user->delete();

        return response()->json([
            'status' => true,
            'message' => 'User deleted successfully',
        ]);
    }

    /**
     * Return a simplified user list for team assignment.
     */
    public function getTeamUsers(Request $request)
    {
        $users = User::select('id', 'name', 'email', 'role')
            ->orderBy('name')
            ->get();

        return response()->json($users);
    }
}
